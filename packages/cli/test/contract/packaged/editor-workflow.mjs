import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const packagedBin = join(directory, "../../../dist/bin.mjs");
const root = await mkdtemp(join(tmpdir(), "ffd-packaged-editor-"));
const fakeBin = join(root, "bin");
const openedUrlPath = join(root, "opened-url.txt");
const openerEnvironmentPath = join(root, "opener-environment.txt");
const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const revisionId = "019fae8b-1234-7000-8000-000000000003";
const collectionId = "019fae8b-1234-7000-8000-000000000004";
const fieldId = "019fae8b-1234-7000-8000-000000000005";
const digest = "a".repeat(64);
const token = "packaged-editor-management-token";
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
const form = {
  source: "published",
  collectionId,
  revisionId,
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: digest,
  role: "developer",
  canEdit: true,
  fields: [
    {
      id: fieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: {
        helpText: null,
        placeholder: "Title",
        visibleToRoles: ["developer"],
        editableByRoles: ["developer"],
      },
      configuration: { maxLength: 160 },
      children: [],
    },
  ],
  editableFieldIds: [fieldId],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: collectionId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer"],
        groups: [
          {
            id: revisionId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: ["developer"],
            fields: [
              {
                id: fieldId,
                fieldId,
                position: 0,
                helpTextOverride: null,
                visibleToRoles: ["developer"],
              },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: {},
};
const hostedRequests = [];

function success(response, data) {
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ ok: true, data, error: null, message: "Completed" }));
}

const hosted = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  hostedRequests.push({
    method: request.method,
    path: url.pathname,
    authorization: request.headers.authorization,
    origin: request.headers.origin,
  });
  if (request.headers.authorization !== `Bearer ${token}` || request.headers.origin !== undefined) {
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
      fields: [{ collectionSourceKey: "posts", sourceKey: "title", fieldId, apiKey: "title" }],
      enumOptions: [],
      revisions: [
        {
          collectionSourceKey: "posts",
          collectionId,
          revisionId,
          structureHash: "b".repeat(64),
          contractHash: digest,
          changed: false,
        },
      ],
    });
    return;
  }
  if (url.pathname.endsWith("/form")) {
    success(response, form);
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND" } }));
});

function waitForFile(path, timeoutMs = 10_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        resolve(await readFile(path, "utf8"));
      } catch {
        if (Date.now() - started >= timeoutMs) {
          reject(new Error("Timed out waiting for packaged editor browser launch."));
          return;
        }
        setTimeout(poll, 25);
      }
    };
    void poll();
  });
}

let child;
try {
  await new Promise((resolve, reject) => {
    hosted.once("error", reject);
    hosted.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = hosted.address();
  if (address === null || typeof address === "string") throw new Error("Hosted fixture failed.");
  const apiOrigin = `http://127.0.0.1:${address.port}`;
  await mkdir(fakeBin);
  const opener = join(fakeBin, "xdg-open");
  await writeFile(
    opener,
    '#!/bin/sh\nprintf "%s" "$1" > "$FFD_EDITOR_URL_FILE"\nprintf "%s" "${FFD_MANAGEMENT_TOKEN-unset}" > "$FFD_EDITOR_ENV_FILE"\n',
  );
  await chmod(opener, 0o755);
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: apiOrigin,
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

  child = spawn(process.execPath, [packagedBin, "editor"], {
    cwd: root,
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      HOME: root,
      FFD_MANAGEMENT_TOKEN: token,
      FFD_EDITOR_URL_FILE: openedUrlPath,
      FFD_EDITOR_ENV_FILE: openerEnvironmentPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  let openedUrlValue;
  try {
    openedUrlValue = await waitForFile(openedUrlPath);
  } catch {
    throw new Error(`Packaged editor did not launch: ${stderr}`);
  }
  const openedUrl = new URL(openedUrlValue);
  if ((await waitForFile(openerEnvironmentPath)) !== "unset")
    throw new Error("Management authority entered the browser opener environment.");
  if (openedUrl.hostname !== "127.0.0.1" || openedUrl.protocol !== "http:")
    throw new Error("Packaged editor opened a non-loopback browser URL.");
  const challenge = new URLSearchParams(openedUrl.hash.slice(1)).get("session");
  if (challenge === null || challenge.length < 43 || openedUrl.search !== "")
    throw new Error("Packaged editor session handoff is invalid.");
  const origin = openedUrl.origin;
  const [page, script] = await Promise.all([
    fetch(origin, { redirect: "error" }),
    fetch(`${origin}/assets/editor.js`, { redirect: "error" }),
  ]);
  const pageText = await page.text();
  const scriptText = await script.text();
  if (
    page.status !== 200 ||
    script.status !== 200 ||
    page.headers.get("cache-control") !== "no-store" ||
    !page.headers.get("content-security-policy")?.includes("default-src 'none'") ||
    `${pageText}${scriptText}`.includes(token) ||
    `${pageText}${scriptText}`.includes(challenge)
  ) {
    throw new Error("Packaged editor assets violated the token/CSP boundary.");
  }
  const sessionHeaders = {
    Origin: origin,
    "Content-Type": "application/json",
    "X-FFD-Editor-Session": challenge,
  };
  const session = await fetch(`${origin}/api/session`, {
    method: "POST",
    headers: sessionHeaders,
    body: "{}",
    redirect: "error",
  });
  const status = await fetch(`${origin}/api/status`, {
    headers: { "X-FFD-Editor-Session": challenge },
    redirect: "error",
  });
  const localSchema = await fetch(`${origin}/api/operation`, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({ operation: "schema.local" }),
    redirect: "error",
  });
  const generatedForm = await fetch(`${origin}/api/operation`, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({ operation: "form.get", collectionKey: "posts" }),
    redirect: "error",
  });
  const statusBody = await status.json();
  const schemaBody = await localSchema.json();
  const formBody = await generatedForm.json();
  if (
    session.status !== 200 ||
    statusBody.schemaMatchesHosted !== true ||
    statusBody.schemaValid !== true ||
    schemaBody.data.localProject.collections[0].sourceKey !== "posts" ||
    formBody.data.fields[0].apiKey !== "title"
  ) {
    throw new Error("Packaged editor did not complete its controlled loopback workflow.");
  }
  if (
    hostedRequests.some((request) => request.authorization !== `Bearer ${token}` || request.origin)
  )
    throw new Error("Packaged editor weakened the hosted originless bearer boundary.");

  child.kill("SIGTERM");
  const exitCode = await new Promise((resolve) => child.once("exit", resolve));
  child = undefined;
  if (exitCode !== 0 || stderr !== "")
    throw new Error(`Packaged editor shutdown failed: ${stderr}`);
  process.stdout.write("packaged loopback editor workflow passed\n");
} finally {
  child?.kill("SIGKILL");
  await new Promise((resolve) => hosted.close(resolve));
  await rm(root, { recursive: true, force: true });
}
