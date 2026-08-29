import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const directory = dirname(fileURLToPath(import.meta.url));
const packagedBin = join(directory, "../../../dist/bin");
const root = await mkdtemp(join(tmpdir(), "ffd-packaged-authoring-"));
const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const entryId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const collectionId = "019fae8b-1234-7000-8000-000000000005";
const fieldId = "019fae8b-1234-7000-8000-000000000006";
const digest = "a".repeat(64);
const structureHash = "b".repeat(64);
const token = "packaged-management-token";
const project = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: false,
          localization: "localized",
          configuration: { maxLength: 160 },
        },
      ],
    },
  ],
};
const summary = {
  id: entryId,
  displayName: "Post",
  nameVersion: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};
const validation = { valid: true, issues: [], capped: false };
const requests = [];

function success(response, data) {
  response.writeHead(200, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify({ ok: true, data, error: null, message: "Completed" }));
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bytes = Buffer.concat(chunks).toString("utf8");
  return bytes === "" ? {} : JSON.parse(bytes);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestBody = await body(request);
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      body: requestBody,
    });
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401);
      response.end();
      return;
    }
    if (url.pathname.endsWith("/schema/manifest")) {
      success(response, {
        projectId,
        environmentId,
        environmentKey: "main",
        locales: [],
        localeContractHash: digest,
        collections: [],
        nextCursor: null,
      });
      return;
    }
    if (url.pathname.endsWith("/schema/export")) {
      success(response, {
        project,
        current: { projectManifestHash: digest, revisionIds: { posts: revisionId } },
        collections: [{ sourceKey: "posts", collectionId, apiKey: "posts" }],
        fields: [
          {
            collectionSourceKey: "posts",
            sourceKey: "title",
            fieldId,
            apiKey: "title",
          },
        ],
        enumOptions: [],
        revisions: [
          {
            collectionSourceKey: "posts",
            collectionId,
            revisionId,
            structureHash,
            contractHash: digest,
            changed: false,
          },
        ],
      });
      return;
    }
    if (url.pathname.endsWith("/schema/plan")) {
      success(response, {
        current: { projectManifestHash: digest, revisionIds: { posts: revisionId } },
        changes: [],
        candidates: [
          {
            collectionSourceKey: "posts",
            collectionId,
            currentRevisionId: revisionId,
            containsUnallocatedIdentities: false,
            candidateStructureHash: structureHash,
            candidateContractHash: digest,
          },
        ],
        valid: true,
        planHash: "c".repeat(64),
        issues: [],
      });
      return;
    }
    if (url.pathname.endsWith("/schema/apply")) {
      success(response, {
        commandId: requestBody.commandId,
        replayed: false,
        noOp: true,
        projectManifestHash: digest,
        collections: [{ sourceKey: "posts", collectionId, apiKey: "posts" }],
        fields: [
          {
            collectionSourceKey: "posts",
            sourceKey: "title",
            fieldId,
            apiKey: "title",
          },
        ],
        enumOptions: [],
        revisions: [
          {
            collectionSourceKey: "posts",
            collectionId,
            revisionId,
            structureHash,
            contractHash: digest,
            changed: false,
          },
        ],
      });
      return;
    }
    if (url.pathname.endsWith("/entries") && request.method === "GET") {
      success(response, { items: [summary], nextCursor: null });
      return;
    }
    if (url.pathname.endsWith("/entries") && request.method === "POST") {
      success(response, {
        entry: summary,
        commandId: requestBody.commandId,
        sharedVersion: 0,
        sharedRevisionId: null,
        localizedVersion: 1,
        localizedRevisionId: revisionId,
        validation,
      });
      return;
    }
    if (url.pathname.endsWith("/draft") && request.method === "GET") {
      success(response, {
        entry: summary,
        locale: "en-US",
        schemaRevisionId: revisionId,
        contractHash: digest,
        sharedVersion: 0,
        sharedRevisionId: null,
        sharedValues: {},
        localizedVersion: 1,
        localizedRevisionId: revisionId,
        localizedValues: { title: "Hosted value" },
        canEditShared: true,
        validation,
      });
      return;
    }
    if (url.pathname.endsWith("/draft") && request.method === "PATCH") {
      success(response, {
        entryId,
        commandId: requestBody.commandId,
        sharedChanged: false,
        sharedVersion: 0,
        sharedRevisionId: null,
        localizedChanged: true,
        localizedVersion: 2,
        localizedRevisionId: revisionId,
        validation,
      });
      return;
    }
    if (url.pathname.endsWith("/publication/validate")) {
      success(response, {
        entryId,
        locale: "en-US",
        stateVersion: 0,
        currentPublicationId: null,
        schemaRevisionId: revisionId,
        contractHash: digest,
        sharedRevisionId: null,
        sharedVersion: 0,
        localizedRevisionId: revisionId,
        localizedVersion: 2,
        valid: true,
        issues: [],
        capped: false,
        contentHash: "d".repeat(64),
        authorityHash: "e".repeat(64),
        size: null,
        referencesWouldRefresh: false,
        wouldCreatePublication: true,
      });
      return;
    }
    const publication = {
      id: "019fae8b-1234-7000-8000-000000000007",
      entryId,
      locale: "en-US",
      sequence: 1,
      schemaRevisionId: revisionId,
      contractHash: digest,
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: revisionId,
      localizedVersion: 2,
      contentHash: "d".repeat(64),
      authorityHash: "e".repeat(64),
      documentHash: "f".repeat(64),
      size: {
        documentBytes: 10,
        referenceManifestBytes: 0,
        combinedBytes: 10,
        maximumBytes: 1_000,
        bucket: "small",
      },
      publishedAt: "2026-08-24T00:00:00.000Z",
      current: true,
    };
    if (url.pathname.endsWith("/publication/publish")) {
      success(response, {
        entryId,
        locale: "en-US",
        commandId: requestBody.commandId,
        stateVersion: 1,
        resultKind: "changed",
        publication,
      });
      return;
    }
    if (url.pathname.endsWith("/publication") && request.method === "GET") {
      success(response, {
        entryId,
        locale: "en-US",
        state: "published",
        stateVersion: 1,
        currentPublication: publication,
        currentSchemaRevisionId: revisionId,
        currentContractHash: digest,
        currentSharedRevisionId: null,
        currentSharedVersion: 0,
        currentLocalizedRevisionId: revisionId,
        currentLocalizedVersion: 2,
        sharedChanged: false,
        localizedChanged: false,
        schemaChanged: false,
        changedSincePublication: false,
      });
      return;
    }
    if (url.pathname.endsWith("/publication/unpublish")) {
      success(response, {
        entryId,
        locale: "en-US",
        commandId: requestBody.commandId,
        stateVersion: 2,
        resultKind: "changed",
        unpublishedPublicationId: publication.id,
        unpublishedPublicationSequence: 1,
        unpublishedAt: "2026-08-24T00:00:00.000Z",
      });
      return;
    }
    response.writeHead(404);
    response.end();
  } catch (cause) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(String(cause));
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (address === null || typeof address === "string") throw new Error("Expected server address.");

async function run(arguments_) {
  const result = await executeFile(process.execPath, [packagedBin, ...arguments_, "--json"], {
    cwd: root,
    env: { PATH: process.env.PATH ?? "", HOME: root, FFD_MANAGEMENT_TOKEN: token },
    timeout: 15_000,
  });
  return JSON.parse(result.stdout);
}

try {
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
      projectId,
      environment: "main",
      output: "generated",
      schema: "project.schema.ts",
    }),
    "utf8",
  );
  await writeFile(
    join(root, "mutations.json"),
    JSON.stringify([
      { operation: "set", scope: "localized", path: ["title"], value: "Fixture value" },
    ]),
    "utf8",
  );

  const results = [];
  results.push(await run(["schema", "export"]));
  results.push(await run(["schema", "plan"]));
  results.push(await run(["schema", "push"]));
  results.push(
    await run([
      "entry",
      "create",
      "--collection",
      "posts",
      "--locale",
      "en-US",
      "--name",
      "Post",
      "--mutations",
      "mutations.json",
    ]),
  );
  results.push(await run(["entry", "list", "--collection", "posts", "--locale", "en-US"]));
  results.push(
    await run(["entry", "get", "--collection", "posts", "--entry", entryId, "--locale", "en-US"]),
  );
  results.push(
    await run([
      "entry",
      "update",
      "--collection",
      "posts",
      "--entry",
      entryId,
      "--locale",
      "en-US",
      "--mutations",
      "mutations.json",
    ]),
  );
  results.push(
    await run([
      "entry",
      "publish",
      "--collection",
      "posts",
      "--entry",
      entryId,
      "--locale",
      "en-US",
    ]),
  );
  results.push(
    await run([
      "entry",
      "unpublish",
      "--collection",
      "posts",
      "--entry",
      entryId,
      "--locale",
      "en-US",
    ]),
  );

  if (results.some((result) => result.accepted !== true)) {
    throw new Error("Packaged Authoring workflow returned an unaccepted result.");
  }
  const generated = await readFile(join(root, "project.schema.ts"), "utf8");
  const stateFiles = await readdir(join(root, ".framerfordevs"), { recursive: true });
  const stateBytes = (
    await Promise.all(
      stateFiles
        .filter((path) => path.endsWith(".json"))
        .map((path) => readFile(join(root, ".framerfordevs", path), "utf8")),
    )
  ).join("\n");
  if (
    !generated.includes("satisfies ProjectSchema") ||
    `${generated}${stateBytes}`.includes(token) ||
    stateBytes.includes("Fixture value") ||
    stateFiles.some((path) => path.includes("retry/content-command.json"))
  ) {
    throw new Error("Packaged Authoring workflow persisted secret/content/retry authority.");
  }
  if (!requests.some((request) => request.path.endsWith("/schema/apply"))) {
    throw new Error("Packaged schema apply was not observed.");
  }
  process.stdout.write("packaged Authoring schema and content workflows passed\n");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
