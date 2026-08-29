import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import ts from "typescript";

import { canonicalizeJson, sha256 } from "../canonical";
import { planGeneration } from "./index";
import { type JsonValue, ToolingCollectionRevision, ToolingManifestPage } from "../schema";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const localeId = "019fae8b-1234-7000-8000-000000000005";

function field(
  position: number,
  kind: string,
  configuration: JsonValue = {},
  children: ReadonlyArray<JsonValue> = [],
) {
  return {
    id: `019fae8b-1234-7000-8000-${String(position + 10).padStart(12, "0")}`,
    apiKey: `${kind}_field`,
    kind,
    required: position % 2 === 0,
    localization: "localized",
    configuration,
    children,
  };
}

function fixture() {
  const listItem = {
    id: "019fae8b-1234-7000-8000-000000000090",
    apiKey: null,
    kind: "short_text",
    required: null,
    localization: "localized",
    configuration: { maxLength: 50 },
    children: [],
  };
  const objectChild = {
    id: "019fae8b-1234-7000-8000-000000000091",
    apiKey: "nested_title",
    kind: "short_text",
    required: true,
    localization: "localized",
    configuration: {},
    children: [],
  };
  const fields = [
    field(0, "short_text", { minLength: 1, maxLength: 100 }),
    field(1, "long_text"),
    field(2, "rich_text"),
    field(3, "number", { mode: "integer", minimum: 0, maximum: 100 }),
    field(4, "decimal"),
    field(5, "money", { currencies: ["USD", "EUR"] }),
    field(6, "boolean"),
    field(7, "date"),
    field(8, "date_time"),
    field(9, "enum", { options: ["draft", "published"] }),
    field(10, "url"),
    field(11, "email"),
    field(12, "slug"),
    field(13, "json"),
    field(14, "object", {}, [objectChild]),
    field(15, "list", { minItems: 1, maxItems: 10 }, [listItem]),
    field(16, "reference"),
    field(17, "external_asset"),
  ];
  const contract = {
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: "iso-4217@2026-01-01",
    collectionApiKey: "blog_posts",
    fields,
  };
  const contractHash = sha256(canonicalizeJson(contract));
  const revision = Schema.decodeUnknownSync(ToolingCollectionRevision)({
    projectId,
    environmentId,
    environmentKey: "main",
    collectionId,
    collectionKey: "blog_posts",
    revisionId,
    revisionSequence: 3,
    contractHash,
    publishedAt: "2026-08-01T12:00:00.000Z",
    contract,
  });
  const locales = [{ id: localeId, tag: "en" }];
  const manifest = Schema.decodeUnknownSync(ToolingManifestPage)({
    projectId,
    environmentId,
    environmentKey: "main",
    locales,
    localeContractHash: sha256(canonicalizeJson(locales)),
    collections: [
      {
        id: collectionId,
        key: "blog_posts",
        revisionId,
        revisionSequence: 3,
        contractHash,
      },
    ],
    nextCursor: null,
  });
  return { manifest, revision };
}

describe("deterministic project generator", () => {
  it("emits all six deterministic outputs and one bounded canonical lock", () => {
    const { manifest, revision } = fixture();
    const first = planGeneration({ manifest, revisions: [revision] });
    const second = planGeneration({ manifest, revisions: [revision] });

    assert.deepStrictEqual(first, second);
    assert.deepEqual(
      first.files.map((file) => file.path),
      ["client.ts", "index.ts", "metadata.json", "openapi.json", "schema.json", "schema.ts"],
    );
    assert.strictEqual(first.lock.files.length, 6);
    assert.strictEqual(first.lock.collections[0]?.contractHash, revision.contractHash);
    assert.notInclude(first.lockBytes, "publishedAt");
    assert.notInclude(first.lockBytes, "displayLabel");
    assert.notInclude(first.lockBytes, "workspaceId");
    assert.notInclude(first.lockBytes, "/home/");
    assert.isTrue(first.files.every((file) => sha256(file.bytes) === file.sha256));
  });

  it("covers every field kind with syntactically valid generated TypeScript", () => {
    const { manifest, revision } = fixture();
    const plan = planGeneration({ manifest, revisions: [revision] });
    const source = plan.files.find((file) => file.path === "schema.ts")?.bytes;
    if (source === undefined) throw new Error("schema.ts was not generated");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        strict: true,
      },
      reportDiagnostics: true,
    });

    assert.deepEqual(
      (transpiled.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ),
      [],
    );
    for (const fragment of [
      "PortableTextDocumentSchema",
      "DecimalSchema",
      'Schema.Literal("EUR", "USD")',
      "Schema.Boolean",
      "Schema.Literal",
      "DateSchema",
      "DateTimeSchema",
      "UrlSchema",
      "EmailSchema",
      "SlugSchema",
      "JsonValueSchema",
      "Schema.Array",
      "EntryIdSchema",
      "ExternalAssetSchema",
    ]) {
      assert.include(source, fragment);
    }
  });

  it("semantically compiles the complete generated TypeScript fixture", () => {
    const { manifest, revision } = fixture();
    const plan = planGeneration({ manifest, revisions: [revision] });
    const directory = mkdtempSync(join(tmpdir(), "ffd-generated-types-"));
    try {
      const rootNames: Array<string> = [];
      for (const file of plan.files) {
        if (!file.path.endsWith(".ts")) continue;
        const path = join(directory, file.path);
        writeFileSync(path, file.bytes, "utf8");
        rootNames.push(path);
      }
      const program = ts.createProgram({
        rootNames,
        options: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          ignoreDeprecations: "6.0",
          baseUrl: process.cwd(),
          types: ["node"],
          typeRoots: [resolve(process.cwd(), "node_modules/@types")],
          paths: {
            effect: [resolve(process.cwd(), "node_modules/effect/dist/dts/index.d.ts")],
            "@framerfordevs/sdk/client": [resolve(process.cwd(), "../sdk/src/client/index.ts")],
            "@framerfordevs/sdk/effect": [resolve(process.cwd(), "../sdk/src/effect/index.ts")],
          },
        },
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.deepEqual(
        diagnostics.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
        [],
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("rejects incomplete and hash-mismatched authority", () => {
    const { manifest, revision } = fixture();
    const incomplete = Schema.decodeUnknownSync(ToolingManifestPage)({
      ...manifest,
      nextCursor: "continuation",
    });
    const mismatched = ToolingCollectionRevision.make({
      ...revision,
      contractHash: "0".repeat(64),
    });

    assert.throws(() => planGeneration({ manifest: incomplete, revisions: [revision] }));
    assert.throws(() => planGeneration({ manifest, revisions: [mismatched] }));
    assert.throws(() => planGeneration({ manifest, revisions: [] }));
  });
});
