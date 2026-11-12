import { createServer } from "node:http";

import express, { type RequestHandler } from "express";

import { createExpressStudioMiddleware } from "@framerfordevs/studio-adapter-express";
import {
  createStudioFetchHandler,
  loadPackagedStudioAssets,
  type StudioFetchHandler,
} from "@framerfordevs/studio-server";
import { makeMemoryStudioStore } from "@framerfordevs/studio-server/testing";

export interface StudioBrowserFixture {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

const contentCollectionId = "55555555-5555-4555-8555-555555555555";
const contentLocaleId = "66666666-6666-4666-8666-666666666666";
const contentFrenchLocaleId = "66666666-6666-4666-8666-666666666667";
const contentSchemaRevisionId = "77777777-7777-4777-8777-777777777777";
const contentEntryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contentLocalizedRevisionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentEnvelope(data: unknown) {
  return { ok: true, data, error: null, message: "Content operation completed." };
}

function browserContentForm(canEdit = true) {
  const fields = Array.from({ length: 100 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    parentFieldId: null,
    nodeRole: "root",
    displayLabel: `Field ${index + 1}`,
    kind: index === 99 ? "reference" : "short_text",
    required: false,
    localization: "localized",
    position: index,
    helpText: null,
    placeholder: null,
    configuration: index === 99 ? { targetCollectionId: contentCollectionId } : {},
    children: [],
  }));
  return {
    collectionId: contentCollectionId,
    schemaRevisionId: contentSchemaRevisionId,
    contractHash: "a".repeat(64),
    canEdit,
    fields,
    editableFieldIds: canEdit ? fields.map((field) => field.id) : [],
    tabs: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        title: "Content",
        description: null,
        position: 0,
        groups: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            title: "Fields",
            description: null,
            position: 0,
            columns: 2,
            fields: fields.map((field, index) => ({
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              fieldId: field.id,
              position: index,
              helpTextOverride: null,
            })),
          },
        ],
      },
    ],
    sidebarGroups: [],
    currencyMinorUnits: {},
  };
}

function token() {
  return {
    access_token: "browser-fixture-access-token",
    refresh_token: "browser-fixture-refresh-token",
    token_type: "Bearer",
    expires_in: 300,
    scope: "studio:session offline_access",
  };
}

export async function startStudioBrowserFixture(): Promise<StudioBrowserFixture> {
  const app = express();
  let middleware: RequestHandler | null = null;
  let origin = "";
  let accessExpiresAt = Date.now() + 300_000;
  let entryExists = false;
  let entryName = "Browser article";
  let nameVersion = 1;
  let localizedVersion = 1;
  let localizedValues: Readonly<Record<string, unknown>> = {};
  let conflictInjected = false;
  const createdAt = "2026-09-29T10:00:00.000Z";
  const validation = { status: "valid", issues: [], capped: false };
  let currentValidation: Readonly<Record<string, unknown>> = validation;
  const capabilities = {
    canCreate: true,
    canRename: true,
    canSaveLocalized: true,
    canSaveShared: false,
  };
  const readOnlyCapabilities = {
    canCreate: false,
    canRename: false,
    canSaveLocalized: false,
    canSaveShared: false,
  };
  const entry = () => ({
    id: contentEntryId,
    displayName: entryName,
    nameVersion,
    createdAt,
    updatedAt: new Date(Date.parse(createdAt) + localizedVersion * 1_000).toISOString(),
  });
  const applyMutations = (input: unknown) => {
    const next: Record<string, unknown> = Object.fromEntries(Object.entries(localizedValues));
    if (!Array.isArray(input)) return;
    for (const candidate of input) {
      if (!isRecord(candidate) || !Array.isArray(candidate.path) || candidate.path.length !== 1)
        continue;
      const fieldId = candidate.path[0];
      if (typeof fieldId !== "string") continue;
      if (candidate.operation === "unset") delete next[fieldId];
      else if (candidate.operation === "set") Reflect.set(next, fieldId, candidate.value);
    }
    localizedValues = next;
  };
  app.use("/studio", (request, response, next) => {
    if (middleware === null) {
      response.status(503).end();
      return;
    }
    middleware(request, response, next);
  });
  app.get("/api/auth/oauth2/authorize", (request, response) => {
    const redirectUri =
      typeof request.query.redirect_uri === "string" ? request.query.redirect_uri : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", "browser-fixture-code");
    callback.searchParams.set("state", state);
    callback.searchParams.set("iss", `${origin}/api/auth`);
    response.redirect(302, callback.toString());
  });
  app.post(
    "/api/auth/oauth2/token",
    express.urlencoded({ extended: false, limit: "8kb" }),
    (_request, response) => {
      accessExpiresAt = Date.now() + 300_000;
      response.json(token());
    },
  );
  app.get(
    "/api/studio/v1/projects/:projectId/environments/:environmentId/bootstrap",
    (_request, response) =>
      response.json({
        ok: true,
        data: {
          formatVersion: 1,
          registration: {
            id: "11111111-1111-4111-8111-111111111111",
            version: 3,
            applicationOrigin: origin,
            mountPath: "/studio",
          },
          project: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Browser Studio",
            workspaceId: "44444444-4444-4444-8444-444444444444",
          },
          environment: {
            id: "33333333-3333-4333-8333-333333333333",
            key: "main",
            name: "main",
          },
          user: {
            id: "browser-user",
            name: "Browser User",
            email: "browser@example.test",
          },
          role: "editor",
          effectiveActions: ["project.read"],
          session: { expiresAt: new Date(accessExpiresAt).toISOString() },
        },
        error: null,
        message: "Studio bootstrap loaded.",
      }),
  );
  app.post("/api/auth/oauth2/revoke", (_request, response) => response.status(200).end());
  app.use("/api/studio-content/v2", express.json({ limit: "1mb", strict: true }));
  app.get(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/context",
    (_request, response) =>
      response.json(
        contentEnvelope({
          locales: [
            {
              id: contentLocaleId,
              tag: "en",
              displayName: "English",
              canRead: true,
              canWrite: true,
            },
            {
              id: contentFrenchLocaleId,
              tag: "fr",
              displayName: "French",
              canRead: true,
              canWrite: true,
            },
          ],
          collections: [
            {
              id: contentCollectionId,
              displayName: "Articles",
              capabilities,
            },
          ],
          configurationNotices: [],
        }),
      ),
  );
  app.get(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries",
    (_request, response) => {
      const items = entryExists ? [entry()] : [];
      response.json(
        contentEnvelope({
          items,
          hasMore: false,
          nextCursor: null,
          count: { value: items.length, relation: "exact" },
        }),
      );
    },
  );
  app.get(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/new",
    (request, response) =>
      response.json(
        contentEnvelope({
          localeId: request.params.locale === "fr" ? contentFrenchLocaleId : contentLocaleId,
          locale: request.params.locale,
          form: browserContentForm(),
          capabilities,
        }),
      ),
  );
  app.post(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/search",
    (_request, response) => {
      const items = entryExists ? [entry()] : [];
      response.json(
        contentEnvelope({
          items,
          hasMore: false,
          nextCursor: null,
          count: { value: items.length, relation: "exact" },
        }),
      );
    },
  );
  app.post(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/resolve",
    (request, response) => {
      const ids =
        isRecord(request.body) && Array.isArray(request.body.entryIds) ? request.body.entryIds : [];
      response.json(
        contentEnvelope({
          items:
            entryExists && ids.includes(contentEntryId)
              ? [{ id: contentEntryId, displayName: entryName }]
              : [],
        }),
      );
    },
  );
  app.post(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries",
    (request, response) => {
      if (!isRecord(request.body)) {
        response.status(400).end();
        return;
      }
      if (typeof request.body.displayName === "string") entryName = request.body.displayName;
      applyMutations(request.body.localizedMutations);
      entryExists = true;
      response.status(200).json(
        contentEnvelope({
          entry: entry(),
          commandId: request.body.commandId,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedVersion,
          localizedRevisionId: contentLocalizedRevisionId,
          validation,
        }),
      );
    },
  );
  app.get(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId",
    (request, response) =>
      response.json(
        contentEnvelope({
          localeId: request.params.locale === "fr" ? contentFrenchLocaleId : contentLocaleId,
          locale: request.params.locale,
          form: browserContentForm(request.params.locale !== "fr"),
          capabilities: request.params.locale === "fr" ? readOnlyCapabilities : capabilities,
          draft: {
            entry: entry(),
            schemaRevisionId: contentSchemaRevisionId,
            contractHash: "a".repeat(64),
            sharedVersion: 0,
            sharedRevisionId: null,
            sharedValues: {},
            localizedVersion,
            localizedRevisionId: contentLocalizedRevisionId,
            localizedValues,
            validation: request.params.locale === "fr" ? validation : currentValidation,
          },
        }),
      ),
  );
  app.patch(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId/name",
    (request, response) => {
      if (isRecord(request.body) && typeof request.body.displayName === "string") {
        entryName = request.body.displayName;
        nameVersion += 1;
      }
      response.json(contentEnvelope(entry()));
    },
  );
  app.patch(
    "/api/studio-content/v2/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId/draft",
    (request, response) => {
      if (!isRecord(request.body)) {
        response.status(400).end();
        return;
      }
      const mutations = request.body.localizedMutations;
      if (
        !conflictInjected &&
        Array.isArray(mutations) &&
        mutations.some((candidate) => isRecord(candidate) && candidate.value === "Trigger conflict")
      ) {
        localizedValues = {
          ...localizedValues,
          "10000000-0000-4000-8000-000000000014": "Remote value",
        };
        localizedVersion += 1;
        conflictInjected = true;
        response.status(409).json({
          ok: false,
          data: null,
          error: {
            code: "DRAFT_VERSION_CONFLICT",
            message: "The draft changed elsewhere.",
            retryable: false,
            requestId: "browser-conflict-request",
            details: [
              {
                code: "localized_version_conflict",
                message: "The expected version is stale.",
                scope: "localized",
                expectedVersion: localizedVersion - 1,
                currentVersion: localizedVersion,
              },
            ],
          },
          message: "The draft changed elsewhere.",
        });
        return;
      }
      const invalidValidation =
        Array.isArray(mutations) &&
        mutations.some(
          (candidate) => isRecord(candidate) && candidate.value === "Trigger validation",
        )
          ? {
              status: "invalid",
              issues: [
                {
                  fieldId: "10000000-0000-4000-8000-000000000015",
                  path: "field/10000000-0000-4000-8000-000000000015",
                  scope: "localized",
                  localeId:
                    request.params.locale === "fr" ? contentFrenchLocaleId : contentLocaleId,
                  locale: request.params.locale,
                  code: "invalid_value",
                  message: "This field value is invalid.",
                },
              ],
              capped: false,
            }
          : validation;
      applyMutations(mutations);
      currentValidation = invalidValidation;
      localizedVersion += 1;
      response.json(
        contentEnvelope({
          entryId: contentEntryId,
          commandId: request.body.commandId,
          sharedChanged: false,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedChanged: true,
          localizedVersion,
          localizedRevisionId: contentLocalizedRevisionId,
          validation: invalidValidation,
        }),
      );
    },
  );

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Studio fixture bind failed.");
  origin = `http://127.0.0.1:${address.port}`;
  const handler: StudioFetchHandler = createStudioFetchHandler({
    mode: "test",
    applicationOrigin: origin,
    platformOrigin: origin,
    dashboardOrigin: origin,
    mountPath: "/studio",
    registrationId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    environmentId: "33333333-3333-4333-8333-333333333333",
    store: makeMemoryStudioStore(),
    encryption: {
      activeKeyId: "browser",
      keys: [{ id: "browser", key: new Uint8Array(32).fill(9) }],
    },
    assets: await loadPackagedStudioAssets(),
  });
  middleware = createExpressStudioMiddleware(handler);

  return {
    origin,
    close: async () => {
      await handler.dispose();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
