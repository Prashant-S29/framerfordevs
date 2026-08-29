import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { classifySchemaDrift } from "./index";
import { SchemaLock } from "../schema";

const ids = {
  project: "019fae8b-1234-7000-8000-000000000001",
  environment: "019fae8b-1234-7000-8000-000000000002",
  locale: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  revision: "019fae8b-1234-7000-8000-000000000005",
  field: "019fae8b-1234-7000-8000-000000000006",
  addedField: "019fae8b-1234-7000-8000-000000000007",
};
const filePaths = [
  "client.ts",
  "index.ts",
  "metadata.json",
  "openapi.json",
  "schema.json",
  "schema.ts",
];

interface LockOptions {
  readonly projectId?: string;
  readonly locales?: ReadonlyArray<{ readonly id: string; readonly tag: string }>;
  readonly collections?: ReadonlyArray<unknown>;
}

function collection(options?: {
  readonly id?: string;
  readonly revisionId?: string;
  readonly contractHash?: string;
  readonly fields?: ReadonlyArray<unknown>;
}) {
  return {
    id: options?.id ?? ids.collection,
    key: "blog_posts",
    revisionId: options?.revisionId ?? ids.revision,
    revisionSequence: options?.revisionId === undefined ? 1 : 2,
    contractHash: options?.contractHash ?? "b".repeat(64),
    contract: {
      formatVersion: 2,
      validationProfile: "ffd-fields@1",
      currencyRegistryProfile: null,
      collectionApiKey: "blog_posts",
      fields: options?.fields ?? [
        {
          id: ids.field,
          apiKey: "title",
          kind: "short_text",
          required: false,
          localization: "localized",
          configuration: {},
          children: [],
        },
      ],
    },
  };
}

function lock(options: LockOptions = {}) {
  return Schema.decodeUnknownSync(SchemaLock)({
    lockVersion: 1,
    generatorVersion: "1.0.0",
    sdkCompatibility: "^0.1.0",
    toolingApi: "tooling/v1",
    projectId: options.projectId ?? ids.project,
    environmentId: ids.environment,
    environmentKey: "main",
    locales: options.locales ?? [{ id: ids.locale, tag: "en" }],
    localeContractHash: "a".repeat(64),
    collections: options.collections ?? [collection()],
    files: filePaths.map((path) => ({ path, sha256: "f".repeat(64) })),
  });
}

const cleanFiles = Object.fromEntries(filePaths.map((path) => [path, "f".repeat(64)]));

describe("schema lock drift", () => {
  it("reports exact generated output as up to date", () => {
    const current = lock();
    assert.deepEqual(
      classifySchemaDrift({ locked: current, current, actualFileDigests: cleanFiles }),
      { category: "up_to_date", diagnostics: [] },
    );
  });

  it("gives local generated-file edits precedence", () => {
    const current = lock();
    const report = classifySchemaDrift({
      locked: current,
      current,
      actualFileDigests: { ...cleanFiles, "schema.ts": "0".repeat(64) },
    });

    assert.strictEqual(report.category, "generated_file_modified");
    assert.strictEqual(report.diagnostics[0]?.path, "schema.ts");
  });

  it("distinguishes metadata-only, additive, and breaking stable-ID changes", () => {
    const before = lock();
    const beforeCollection = before.collections[0];
    const beforeField = beforeCollection?.contract.fields[0];
    if (beforeCollection === undefined || beforeField === undefined) {
      throw new Error("Lock fixture is incomplete.");
    }
    const metadata = lock({
      collections: [collection({ revisionId: "019fae8b-1234-7000-8000-000000000008" })],
    });
    const additive = lock({
      collections: [
        collection({
          contractHash: "c".repeat(64),
          fields: [
            ...beforeCollection.contract.fields,
            {
              id: ids.addedField,
              apiKey: "summary",
              kind: "short_text",
              required: false,
              localization: "localized",
              configuration: {},
              children: [],
            },
          ],
        }),
      ],
    });
    const breaking = lock({
      collections: [
        collection({
          contractHash: "d".repeat(64),
          fields: [
            {
              ...beforeField,
              apiKey: "headline",
            },
          ],
        }),
      ],
    });

    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: metadata, actualFileDigests: cleanFiles })
        .category,
      "metadata_only",
    );
    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: additive, actualFileDigests: cleanFiles })
        .category,
      "schema_additive",
    );
    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: breaking, actualFileDigests: cleanFiles })
        .category,
      "schema_breaking",
    );
  });

  it("classifies locale, collection, and pull-authority changes", () => {
    const before = lock();
    const localeAdd = lock({
      locales: [...before.locales, { id: "019fae8b-1234-7000-8000-000000000009", tag: "fr" }],
    });
    const localeBreak = lock({ locales: [] });
    const collectionAdd = lock({
      collections: [
        ...before.collections,
        collection({ id: "019fae8b-1234-7000-8000-000000000010" }),
      ],
    });
    const collectionRemove = lock({ collections: [] });
    const authority = lock({ projectId: "019fae8b-1234-7000-8000-000000000011" });

    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: localeAdd, actualFileDigests: cleanFiles })
        .category,
      "locale_additive",
    );
    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: localeBreak, actualFileDigests: cleanFiles })
        .category,
      "locale_breaking",
    );
    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: collectionAdd, actualFileDigests: cleanFiles })
        .category,
      "collection_added",
    );
    assert.strictEqual(
      classifySchemaDrift({
        locked: before,
        current: collectionRemove,
        actualFileDigests: cleanFiles,
      }).category,
      "collection_removed",
    );
    assert.strictEqual(
      classifySchemaDrift({ locked: before, current: authority, actualFileDigests: cleanFiles })
        .category,
      "authority_changed_during_pull",
    );
  });
});
