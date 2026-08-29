import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Effect, Exit } from "effect";

import { runExperimentalSchemaBuild } from "../../dist/experimental-schema-build.mjs";
import { extractStaticProjectSchema } from "../../dist/schema-extractor.mjs";

const executeFile = promisify(execFile);
const testDirectory = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), "ffd-packaged-extractor-"));
const sentinel = join(root, "sentinel.txt");
const entry = join(root, "framerfordevs.schema.ts");
let connections = 0;
const server = createServer((socket) => {
  connections += 1;
  socket.destroy();
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (address === null || typeof address === "string") throw new Error("Expected a TCP address.");

try {
  await writeFile(sentinel, "unchanged", "utf8");
  process.env.FFD_MANAGEMENT_TOKEN = "parent-only-sentinel";
  const hostileSources = [
    `const secret = process.env.FFD_MANAGEMENT_TOKEN; export default { collections: [secret] };`,
    `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sentinel)}, "changed"); export default { collections: [] };`,
    `const network = fetch("http://127.0.0.1:${address.port}"); export default { collections: [network] };`,
  ];
  for (const source of hostileSources) {
    await writeFile(entry, source, "utf8");
    const hostile = await Effect.runPromiseExit(
      extractStaticProjectSchema({ projectRoot: root, entry: "framerfordevs.schema.ts" }),
    );
    if (!Exit.isFailure(hostile)) throw new Error("Hostile schema unexpectedly succeeded.");
    if ((await readFile(sentinel, "utf8")) !== "unchanged") throw new Error("Sentinel changed.");
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  if (connections !== 0) throw new Error("Hostile schema opened a network connection.");

  await writeFile(
    entry,
    `
      import type { ProjectSchema } from "@framerfordevs/schema";
      export default {
        collections: [{
          sourceKey: "posts",
          apiKey: "posts",
          fields: [{
            sourceKey: "title",
            apiKey: "title",
            kind: "short_text",
            required: true,
            localization: "localized",
            configuration: { maxLength: 160 },
          }],
        }],
      } as const satisfies ProjectSchema;
    `,
    "utf8",
  );
  const valid = await Effect.runPromise(
    extractStaticProjectSchema({ projectRoot: root, entry: "framerfordevs.schema.ts" }),
  );
  if (valid.files.join(",") !== "framerfordevs.schema.ts") {
    throw new Error("Packaged worker returned unexpected files.");
  }

  await writeFile(
    join(root, "compose.ts"),
    `
      const probe = [
        globalThis.constructor.constructor(${JSON.stringify("return (() => { try { return process.env.FFD_MANAGEMENT_TOKEN; } catch (error) { return error.name; } })()")})(),
        globalThis.constructor.constructor(${JSON.stringify(`return (() => { try { return require("node:fs").readFileSync(${JSON.stringify(sentinel)}, "utf8"); } catch (error) { return error.name; } })()`)})(),
        globalThis.constructor.constructor(${JSON.stringify(`return (() => { try { return fetch("http://127.0.0.1:${address.port}"); } catch (error) { return error.name; } })()`)})(),
      ].join("|");
      export default {
        collections: [{
          sourceKey: "probes",
          apiKey: "probes",
          fields: [{
            sourceKey: "capabilities",
            apiKey: "capabilities",
            kind: "short_text",
            required: true,
            localization: "shared",
            configuration: { default: probe },
          }],
        }],
      };
    `,
    "utf8",
  );
  const experimental = await Effect.runPromise(
    runExperimentalSchemaBuild({ projectRoot: root, entry: "compose.ts", experimental: true }),
  );
  if (experimental.memoryLimitHard || experimental.canonicalJson.includes("parent-only-sentinel")) {
    throw new Error("Experimental build reported an invalid boundary.");
  }
  if ((await readFile(sentinel, "utf8")) !== "unchanged") throw new Error("Sentinel changed.");
  await new Promise((resolve) => setTimeout(resolve, 25));
  if (connections !== 0) throw new Error("Experimental build opened a network connection.");

  const compositionDirectory = join(root, "schema");
  await mkdir(compositionDirectory, { recursive: true });
  await writeFile(
    join(compositionDirectory, "compose.schema.ts"),
    `
      import { defineCollection, defineSchema } from "@framerfordevs/schema/compose";
      export default defineSchema({
        collections: [defineCollection({
          sourceKey: "posts",
          apiKey: "posts",
          fields: [{
            sourceKey: "title",
            apiKey: "title",
            kind: "short_text",
            required: true,
            localization: "localized",
            configuration: {},
          }],
        })],
      });
    `,
    "utf8",
  );
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
      projectId: "019fae8b-1234-7000-8000-000000000001",
      environment: "main",
      output: "src/framerfordevs",
      schema: "generated.schema.ts",
      schemaBuild: { entry: "schema/compose.schema.ts" },
    }),
    "utf8",
  );
  const packagedBin = join(testDirectory, "../../dist/bin.mjs");
  const binSource = await readFile(packagedBin, "utf8");
  const schemaBuildImport = /import\("(\.\/schema-build-bin-[^"]+\.mjs)"\)/u.exec(binSource)?.[1];
  const schemaAuthoringImport = /import\("(\.\/schema-authoring-bin-[^"]+\.mjs)"\)/u.exec(
    binSource,
  )?.[1];
  const contentImport = /import\("(\.\/content-bin-[^"]+\.mjs)"\)/u.exec(binSource)?.[1];
  const editorImport = /import\("(\.\/editor-bin-[^"]+\.mjs)"\)/u.exec(binSource)?.[1];
  if (
    schemaBuildImport === undefined ||
    schemaAuthoringImport === undefined ||
    contentImport === undefined ||
    editorImport === undefined ||
    !binSource.includes('import("./authenticated-bin-')
  ) {
    throw new Error("Packaged CLI does not preserve pre-auth dynamic dispatch.");
  }
  const collectStaticGraph = async (path, visited = new Set()) => {
    if (visited.has(path)) return "";
    visited.add(path);
    const source = await readFile(path, "utf8");
    const dependencies = [...source.matchAll(/(?:from|import)\s+"(\.\/[^"]+\.mjs)"/gu)].map(
      (match) => match[1],
    );
    const nested = await Promise.all(
      dependencies.map((dependency) =>
        collectStaticGraph(resolve(dirname(path), dependency), visited),
      ),
    );
    return `${source}\n${nested.join("\n")}`;
  };
  const schemaBuildGraph = await collectStaticGraph(
    resolve(dirname(packagedBin), schemaBuildImport),
  );
  const schemaAuthoringPreAuthGraph = await collectStaticGraph(
    resolve(dirname(packagedBin), schemaAuthoringImport),
  );
  const contentPreAuthGraph = await collectStaticGraph(
    resolve(dirname(packagedBin), contentImport),
  );
  const editorPreAuthGraph = await collectStaticGraph(resolve(dirname(packagedBin), editorImport));
  for (const forbidden of [
    "@napi-rs/keyring",
    "FFD_MANAGEMENT_TOKEN",
    "makeToolingHttpClient",
    "loginWithDeviceAuthorization",
    "getValidAccessToken",
  ]) {
    if (schemaBuildGraph.includes(forbidden)) {
      throw new Error(`Credential-bearing dependency entered schema build graph: ${forbidden}`);
    }
    if (schemaAuthoringPreAuthGraph.includes(forbidden)) {
      throw new Error(`Credential-bearing dependency entered schema pre-auth graph: ${forbidden}`);
    }
    if (contentPreAuthGraph.includes(forbidden)) {
      throw new Error(`Credential-bearing dependency entered content pre-auth graph: ${forbidden}`);
    }
    if (editorPreAuthGraph.includes(forbidden)) {
      throw new Error(`Credential-bearing dependency entered editor pre-auth graph: ${forbidden}`);
    }
  }
  const editorAssetsDirectory = join(testDirectory, "../../dist/editor-assets");
  const editorAssetNames = (await readdir(join(editorAssetsDirectory, "assets"))).sort();
  const editorHtml = await readFile(join(editorAssetsDirectory, "index.html"), "utf8");
  const editorJavaScript = await readFile(join(editorAssetsDirectory, "assets/editor.js"), "utf8");
  const allEditorJavaScript = (
    await Promise.all(
      editorAssetNames
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(join(editorAssetsDirectory, "assets", name), "utf8")),
    )
  ).join("\n");
  if (
    !editorAssetNames.includes("editor.js") ||
    !editorAssetNames.includes("editor.css") ||
    !editorAssetNames.some((name) => /^content-form-[A-Za-z0-9_-]+\.js$/u.test(name)) ||
    !editorAssetNames.some((name) => /^portable-text-field-[A-Za-z0-9_-]+\.js$/u.test(name)) ||
    Buffer.byteLength(editorJavaScript) > 500_000 ||
    !editorHtml.includes('src="/assets/editor.js"') ||
    /https?:\/\//u.test(editorHtml)
  ) {
    throw new Error("Packaged editor assets are absent, external, or not route-split.");
  }
  for (const forbidden of [
    "FFD_MANAGEMENT_TOKEN",
    "Authorization: Bearer",
    "refresh_token",
    "access_token",
    "@napi-rs/keyring",
    "node:child_process",
    "node:vm",
  ]) {
    if (allEditorJavaScript.includes(forbidden)) {
      throw new Error(`Credential or host authority entered browser assets: ${forbidden}`);
    }
  }
  const commandEnvironment = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? root,
    FFD_MANAGEMENT_TOKEN: "parent-only-sentinel",
  };
  const writeResult = await executeFile(
    process.execPath,
    [packagedBin, "schema", "build", "--json"],
    { cwd: root, env: commandEnvironment, timeout: 10_000 },
  );
  const checkResult = await executeFile(
    process.execPath,
    [packagedBin, "schema", "build", "--check", "--json"],
    { cwd: root, env: commandEnvironment, timeout: 10_000 },
  );
  const writeOutput = JSON.parse(writeResult.stdout);
  const checkOutput = JSON.parse(checkResult.stdout);
  if (writeOutput.memoryLimitHard !== false || checkOutput.accepted !== true) {
    throw new Error("Packaged schema build command returned unexpected authority.");
  }
  const generated = await readFile(join(root, "generated.schema.ts"), "utf8");
  const buildManifest = await readFile(join(root, ".framerfordevs/schema-build.lock.json"), "utf8");
  if (`${generated}${buildManifest}`.includes("parent-only-sentinel")) {
    throw new Error("Packaged schema build persisted credential authority.");
  }
  await writeFile(
    join(root, "schema/compose.schema.ts"),
    `${await readFile(join(root, "schema/compose.schema.ts"), "utf8")}\n// stale\n`,
    "utf8",
  );
  let staleFailure;
  try {
    await executeFile(process.execPath, [packagedBin, "schema", "push", "--json"], {
      cwd: root,
      env: commandEnvironment,
      timeout: 10_000,
    });
  } catch (cause) {
    staleFailure = cause;
  }
  if (
    typeof staleFailure !== "object" ||
    staleFailure === null ||
    !String(Reflect.get(staleFailure, "stderr")).includes("CLI_SCHEMA_BUILD_STALE") ||
    connections !== 0
  ) {
    throw new Error("Stale schema push crossed the pre-auth network boundary.");
  }
  let editorFailure;
  try {
    await executeFile(process.execPath, [packagedBin, "editor"], {
      cwd: root,
      env: commandEnvironment,
      timeout: 10_000,
    });
  } catch (cause) {
    editorFailure = cause;
  }
  if (
    typeof editorFailure !== "object" ||
    editorFailure === null ||
    !String(Reflect.get(editorFailure, "stderr")).includes("CLI_SCHEMA_BUILD_STALE") ||
    connections !== 0
  ) {
    throw new Error("Stale editor input crossed the pre-auth credential/network boundary.");
  }
  let mutationFailure;
  try {
    await executeFile(
      process.execPath,
      [
        packagedBin,
        "entry",
        "update",
        "--collection",
        "posts",
        "--entry",
        "019fae8b-1234-7000-8000-000000000003",
        "--locale",
        "en-US",
        "--mutations",
        "../outside.json",
        "--json",
      ],
      { cwd: root, env: commandEnvironment, timeout: 10_000 },
    );
  } catch (cause) {
    mutationFailure = cause;
  }
  if (
    typeof mutationFailure !== "object" ||
    mutationFailure === null ||
    !String(Reflect.get(mutationFailure, "stderr")).includes("CLI_MUTATION_PATH_INVALID") ||
    connections !== 0
  ) {
    throw new Error("Unsafe content mutation crossed the pre-auth network boundary.");
  }
  process.stdout.write(
    "packaged schema-build/schema-authoring/content/editor pre-auth boundaries passed\n",
  );
} finally {
  delete process.env.FFD_MANAGEMENT_TOKEN;
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
