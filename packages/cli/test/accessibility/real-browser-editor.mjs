import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assetRoot = join(packageRoot, "dist/editor-assets");
const challenge = "r".repeat(43);
const entryId = "019fae8b-1234-7000-8000-000000000001";
const fieldId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000006";
const digest = "a".repeat(64);
const timestamp = "2026-08-24T00:00:00.000Z";
const elementKey = "element-6066-11e4-a52e-4f735466cecf";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const summary = (id, displayName) => ({
  id,
  displayName,
  nameVersion: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
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
          configuration: {},
        },
      ],
    },
  ],
};
const generatedForm = {
  source: "published",
  collectionId: fieldId,
  revisionId: fieldId,
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
        helpText: "A localized title",
        placeholder: "Title",
        visibleToRoles: ["developer"],
        editableByRoles: ["developer"],
      },
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: [fieldId],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: fieldId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer"],
        groups: [
          {
            id: fieldId,
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
const publication = {
  id: revisionId,
  entryId,
  locale: "en-US",
  sequence: 1,
  schemaRevisionId: fieldId,
  contractHash: digest,
  sharedRevisionId: null,
  sharedVersion: 0,
  localizedRevisionId: fieldId,
  localizedVersion: 2,
  contentHash: "b".repeat(64),
  authorityHash: "c".repeat(64),
  documentHash: "d".repeat(64),
  size: {
    documentBytes: 100,
    referenceManifestBytes: 10,
    combinedBytes: 110,
    maximumBytes: 1_048_576,
    bucket: "small",
  },
  publishedAt: timestamp,
  current: true,
};

function json(response, status, body) {
  const bytes = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(bytes),
  });
  response.end(bytes);
}

async function startFixtureServer() {
  let publicationState = "unpublished";
  let publicationStateVersion = 0;
  let localizedVersion = 1;
  let draftTitle = "Initial title";
  const operations = [];
  const files = new Map();
  for (const name of await readdir(join(assetRoot, "assets"))) {
    files.set(`/assets/${name}`, await readFile(join(assetRoot, "assets", name)));
  }
  const html = await readFile(join(assetRoot, "index.html"));
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
        response.end(html);
        return;
      }
      const asset = files.get(url.pathname);
      if (request.method === "GET" && asset !== undefined) {
        const extension = extname(url.pathname);
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type":
            extension === ".css" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
        });
        response.end(asset);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/session") {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        json(response, 200, {
          projectId: "019fae8b-1234-7000-8000-000000000004",
          environment: "main",
          schemaMatchesHosted: true,
          schemaValid: true,
          schemaGeneration: 1,
          schemaDiagnosticCode: null,
          localCollectionCount: 1,
          locales: ["en-US"],
          collections: [{ sourceKey: "posts", apiKey: "posts" }],
        });
        return;
      }
      if (request.method !== "POST" || url.pathname !== "/api/operation") {
        json(response, 404, { ok: false, code: "EDITOR_ROUTE_NOT_FOUND" });
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const operation = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      operations.push(operation.operation);
      const success = (data) => json(response, 200, { ok: true, data });
      switch (operation.operation) {
        case "schema.local":
          success({ localProject: project, hostedProject: project });
          return;
        case "form.get":
          success(generatedForm);
          return;
        case "entries.list":
          success({ items: [summary(entryId, "Post")], nextCursor: null });
          return;
        case "entry.get":
          success({
            entry: summary(entryId, "Post"),
            locale: "en-US",
            schemaRevisionId: fieldId,
            contractHash: digest,
            sharedVersion: 0,
            sharedRevisionId: null,
            sharedValues: {},
            localizedVersion,
            localizedRevisionId: fieldId,
            localizedValues: { title: draftTitle },
            canEditShared: true,
            validation: { valid: true, issues: [], capped: false },
          });
          return;
        case "entry.save":
          localizedVersion = 2;
          draftTitle = "Remote title";
          json(response, 409, { ok: false, error: { code: "DRAFT_CONFLICT" } });
          return;
        case "publication.status":
          success({
            entryId,
            locale: "en-US",
            state: publicationState,
            stateVersion: publicationStateVersion,
            currentPublication: publicationState === "published" ? publication : null,
            currentSchemaRevisionId: fieldId,
            currentContractHash: digest,
            currentSharedRevisionId: null,
            currentSharedVersion: 0,
            currentLocalizedRevisionId: fieldId,
            currentLocalizedVersion: localizedVersion,
            sharedChanged: false,
            localizedChanged: true,
            schemaChanged: false,
            changedSincePublication: publicationState !== "published",
          });
          return;
        case "publication.validate":
          success({
            entryId,
            locale: "en-US",
            stateVersion: publicationStateVersion,
            currentPublicationId: publicationState === "published" ? publication.id : null,
            schemaRevisionId: fieldId,
            contractHash: digest,
            sharedRevisionId: null,
            sharedVersion: 0,
            localizedRevisionId: fieldId,
            localizedVersion,
            valid: true,
            issues: [],
            capped: false,
            contentHash: publication.contentHash,
            authorityHash: publication.authorityHash,
            size: publication.size,
            referencesWouldRefresh: false,
            wouldCreatePublication: publicationState !== "published",
          });
          return;
        case "publication.publish":
          publicationState = "published";
          publicationStateVersion += 1;
          success({
            entryId,
            locale: "en-US",
            commandId: randomUUID(),
            stateVersion: publicationStateVersion,
            resultKind: "changed",
            publication,
          });
          return;
        case "publication.unpublish":
          publicationState = "unpublished";
          publicationStateVersion += 1;
          success({
            entryId,
            locale: "en-US",
            commandId: randomUUID(),
            stateVersion: publicationStateVersion,
            resultKind: "changed",
            unpublishedPublicationId: publication.id,
            unpublishedPublicationSequence: publication.sequence,
            unpublishedAt: timestamp,
          });
          return;
        default:
          json(response, 404, { ok: false, code: "EDITOR_ROUTE_NOT_FOUND" });
      }
    })().catch(() => json(response, 500, { ok: false, code: "FIXTURE_FAILED" }));
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  invariant(address !== null && typeof address === "object", "Fixture address is unavailable.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    operations,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  invariant(address !== null && typeof address === "object", "Driver address is unavailable.");
  const port = address.port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await predicate();
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw lastError ?? new Error("Timed out.");
}

async function main() {
  const fixture = await startFixtureServer();
  const driverPort = await freePort();
  const driver = spawn("geckodriver", ["--port", String(driverPort)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let driverLog = "";
  driver.stderr.setEncoding("utf8");
  driver.stderr.on("data", (chunk) => {
    driverLog += chunk;
  });
  let sessionId;
  const requestDriver = async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${driverPort}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (!response.ok || payload.value?.error)
      throw new Error(payload.value?.message ?? `WebDriver ${method} ${path} failed.`);
    return payload.value;
  };
  try {
    await waitFor(() => requestDriver("GET", "/status"));
    const created = await requestDriver("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "firefox",
          "moz:firefoxOptions": { args: ["-headless"] },
        },
      },
    });
    sessionId = created.sessionId;
    invariant(typeof sessionId === "string", "Firefox session was not created.");
    const sessionPath = `/session/${sessionId}`;
    await requestDriver("POST", `${sessionPath}/url`, {
      url: `${fixture.origin}/#session=${challenge}`,
    });
    const find = (using, value) =>
      waitFor(async () => {
        const element = await requestDriver("POST", `${sessionPath}/element`, { using, value });
        invariant(typeof element?.[elementKey] === "string", `Element ${value} was not found.`);
        return element[elementKey];
      });
    const click = async (using, value) => {
      const element = await find(using, value);
      await requestDriver("POST", `${sessionPath}/element/${element}/click`, {});
      return element;
    };
    const execute = (script, args = []) =>
      requestDriver("POST", `${sessionPath}/execute/sync`, { script, args });

    await find("xpath", "//h1[normalize-space(.)='Framer for Devs editor']");
    const initialAudit = await execute(`return {
      fragment: location.hash,
      challengeInDom: document.documentElement.textContent.includes(${JSON.stringify(challenge)}),
      schemaStatus: document.body.innerText.includes('All local changes saved') && !document.body.innerText.includes('Local structure differs') && !document.body.innerText.includes('Local schema is invalid'),
      width: innerWidth,
      duplicateIds: [...document.querySelectorAll('[id]')].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) !== index).length,
      unnamedButtons: [...document.querySelectorAll('button')].filter((button) => !(button.innerText.trim() || button.getAttribute('aria-label'))).length,
    };`);
    invariant(initialAudit.fragment === "", "The fragment challenge was not removed.");
    invariant(initialAudit.challengeInDom === false, "The challenge entered rendered content.");
    invariant(initialAudit.schemaStatus === true, "Writable schema status was not rendered.");
    invariant(initialAudit.duplicateIds === 0, "Duplicate browser IDs were rendered.");
    invariant(initialAudit.unnamedButtons === 0, "An unnamed browser button was rendered.");

    const postButton = await find("xpath", "//button[normalize-space(.)='Post']");
    await requestDriver("POST", `${sessionPath}/element/${postButton}/click`, {});
    const title = await find("css selector", "input[placeholder='Title']");
    await requestDriver("POST", `${sessionPath}/element/${title}/clear`, {});
    await requestDriver("POST", `${sessionPath}/element/${title}/value`, { text: "Local edit" });
    await find("xpath", "//*[contains(normalize-space(.), 'Unsaved changes')]");
    const focusAudit = await execute(
      "return {placeholder: document.activeElement?.getAttribute('placeholder'), value: document.activeElement?.value};",
    );
    invariant(focusAudit.placeholder === "Title", "Keyboard input did not retain field focus.");
    invariant(focusAudit.value === "Local edit", "Real-browser keyboard input was not controlled.");

    await click("xpath", "//button[normalize-space(.)='Save draft']");
    await find(
      "xpath",
      "//*[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'draft changed elsewhere')]",
    );
    const conflictValue = await requestDriver(
      "GET",
      `${sessionPath}/element/${title}/property/value`,
    );
    invariant(conflictValue === "Local edit", "Conflict recovery discarded unsaved values.");
    const reloadButton = await find("xpath", "//button[normalize-space(.)='Reload current']");
    await requestDriver("POST", `${sessionPath}/element/${reloadButton}/click`, {}).catch(
      () => undefined,
    );
    await requestDriver("POST", `${sessionPath}/alert/accept`, {});
    await find("xpath", "//*[contains(normalize-space(.), 'Current draft reloaded.')]");

    await click("xpath", "//button[normalize-space(.)='Validate and publish en-US']");
    await find("xpath", "//*[contains(normalize-space(.), 'Locale published.')]");
    await click("xpath", "//button[normalize-space(.)='Unpublish en-US']");
    await find("xpath", "//*[contains(normalize-space(.), 'Locale unpublished.')]");

    await requestDriver("POST", `${sessionPath}/window/rect`, {
      width: 390,
      height: 844,
      x: 0,
      y: 0,
    });
    const responsiveAudit = await execute(`return {
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      visibleButtons: [...document.querySelectorAll('button')].filter((button) => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }).length,
      unlabeledControls: [...document.querySelectorAll('input, textarea, select')].filter((control) => !control.labels?.length && ![...document.querySelectorAll('label')].some((label) => label.htmlFor === control.id || label.contains(control)) && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')).map((control) => control.outerHTML),
      persistedHostedContent: Object.values(localStorage).some((value) => value.includes('Local edit') || value.includes('Initial title')),
    };`);
    invariant(
      responsiveAudit.width > 0 && responsiveAudit.width <= 500,
      `Responsive viewport was not applied (${responsiveAudit.width}px).`,
    );
    invariant(responsiveAudit.overflow === false, "The mobile viewport has horizontal overflow.");
    invariant(responsiveAudit.visibleButtons > 0, "No controls remain visible on mobile.");
    invariant(
      responsiveAudit.unlabeledControls.length === 0,
      `An unlabeled form control was rendered: ${responsiveAudit.unlabeledControls.join(", ")}`,
    );
    invariant(
      responsiveAudit.persistedHostedContent === false,
      "Hosted content entered browser persistence.",
    );

    const screenshot = await requestDriver("GET", `${sessionPath}/screenshot`);
    const evidencePath = join(packageRoot, "../../tmp/m13-real-browser-editor.png");
    await writeFile(evidencePath, Buffer.from(screenshot, "base64"));
    for (const operation of [
      "entry.save",
      "publication.validate",
      "publication.publish",
      "publication.unpublish",
    ])
      invariant(fixture.operations.includes(operation), `${operation} was not exercised.`);

    console.log(
      JSON.stringify({
        browser: "firefox-headless",
        viewport: { desktop: initialAudit.width, mobile: responsiveAudit.width },
        keyboardFocus: focusAudit.placeholder,
        conflictPreserved: conflictValue,
        schemaStatus: "valid-and-hosted-matched",
        publication: "publish-and-unpublish-exercised",
        accessibility: {
          duplicateIds: initialAudit.duplicateIds,
          unnamedButtons: initialAudit.unnamedButtons,
          unlabeledControls: responsiveAudit.unlabeledControls.length,
          horizontalOverflow: responsiveAudit.overflow,
        },
        screenshot: basename(evidencePath),
      }),
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\noperations=${JSON.stringify(fixture.operations)}\n${driverLog}`,
    );
  } finally {
    if (sessionId !== undefined) {
      await fetch(`http://127.0.0.1:${driverPort}/session/${sessionId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    driver.kill("SIGTERM");
    await new Promise((resolvePromise) => driver.once("exit", resolvePromise));
    await fixture.close();
  }
}

await main();
