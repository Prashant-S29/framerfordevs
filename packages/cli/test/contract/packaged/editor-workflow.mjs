import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const directory = dirname(fileURLToPath(import.meta.url));
const packagedBin = join(directory, "../../../dist/bin.mjs");
const studioAssets = join(directory, "../../../dist/studio-assets");
const root = await mkdtemp(join(tmpdir(), "ffd-packaged-editor-"));
const projectId = "019fae8b-1234-7000-8000-000000000001";
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
          required: true,
          localization: "localized",
          configuration: { maxLength: 160 },
        },
      ],
    },
  ],
};
let connections = 0;
const hosted = createServer((_request, response) => {
  connections += 1;
  response.writeHead(500);
  response.end();
});

async function failure(arguments_, environment) {
  try {
    await executeFile(process.execPath, [packagedBin, ...arguments_], {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: root, ...environment },
      timeout: 10_000,
    });
  } catch (cause) {
    return String(Reflect.get(cause, "stderr"));
  }
  throw new Error(`Packaged editor unexpectedly succeeded: ${arguments_.join(" ")}`);
}

try {
  await new Promise((resolve, reject) => {
    hosted.once("error", reject);
    hosted.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = hosted.address();
  if (address === null || typeof address === "string") throw new Error("Hosted fixture failed.");
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 1,
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
      projectId,
      environment: "main",
      output: "src/framerfordevs",
      schema: "framerfordevs.schema.ts",
    }),
  );
  await writeFile(
    join(root, "framerfordevs.schema.ts"),
    `import type { ProjectSchema } from "@framerfordevs/schema";\nexport default ${JSON.stringify(project)} as const satisfies ProjectSchema;\n`,
  );

  const management = await failure(["editor"], { FFD_MANAGEMENT_TOKEN: "packaged-management" });
  if (
    !management.includes("CLI_EDITOR_OAUTH_REQUIRED") ||
    management.includes("packaged-management")
  ) {
    throw new Error(`Packaged editor accepted or echoed management authority: ${management}`);
  }
  const stdin = await failure(["editor", "--token-stdin"], {});
  if (!stdin.includes("CLI_FLAG_INVALID")) {
    throw new Error(`Packaged editor accepted the removed token flag: ${stdin}`);
  }
  if (connections !== 0) throw new Error("Packaged editor contacted the API before OAuth.");

  const manifest = JSON.parse(await readFile(join(studioAssets, "manifest.json"), "utf8"));
  const entry = Object.values(manifest).find((candidate) => candidate.isEntry === true);
  if (entry === undefined) throw new Error("Packaged Studio artifact has no entry.");
  for (const candidate of Object.values(manifest)) {
    if (!candidate.file.startsWith("assets/"))
      throw new Error("Packaged Studio artifact is invalid.");
    await readFile(join(studioAssets, candidate.file));
  }
  process.stdout.write("packaged local editor boundary passed\n");
} finally {
  await new Promise((resolve) => hosted.close(resolve));
  await rm(root, { recursive: true, force: true });
}
