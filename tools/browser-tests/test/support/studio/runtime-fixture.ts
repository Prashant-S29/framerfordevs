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
  readonly renderedTokens: ReadonlyArray<string>;
  readonly close: () => Promise<void>;
}

function previewToken(source: "current" | "revision"): string {
  return `ffd_pvh_${source}${"x".repeat(24)}.${"s".repeat(43)}`;
}

const contentCollectionId = "55555555-5555-4555-8555-555555555555";
const contentLocaleId = "66666666-6666-4666-8666-666666666666";
const contentFrenchLocaleId = "66666666-6666-4666-8666-666666666667";
const contentSchemaRevisionId = "77777777-7777-4777-8777-777777777777";
const contentEntryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contentPublicationHash = "e".repeat(64);
const blockingFieldId = "10000000-0000-4000-8000-000000000002";

interface FixtureRevision {
  readonly id: string;
  readonly sequence: number;
  readonly values: Readonly<Record<string, unknown>>;
  readonly previousRevisionId: string | null;
  readonly restoredFromRevisionId: string | null;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly authoredAt: string;
}

interface FixturePublication {
  readonly id: string;
  readonly sequence: number;
  readonly values: Readonly<Record<string, unknown>>;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly publishedAt: string;
}

function fixtureId(prefix: string, sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function changedFields(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

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
    canPublish: true,
    canPublishPresentation: true,
  };
  const readOnlyCapabilities = {
    canCreate: false,
    canRename: false,
    canSaveLocalized: false,
    canSaveShared: false,
    canPublish: false,
    canPublishPresentation: false,
  };
  const layoutForm = browserContentForm();
  let presentation = {
    collectionId: contentCollectionId,
    revisionId: contentSchemaRevisionId,
    sequence: 1,
    presentation: {
      displayName: "Articles",
      description: null as string | null,
      fields: layoutForm.fields.map((field) => ({
        fieldId: field.id,
        parentFieldId: null,
        kind: field.kind,
        displayLabel: field.displayLabel as string | null,
        position: field.position,
        helpText: null as string | null,
        placeholder: null as string | null,
        enumOptions: [] as ReadonlyArray<unknown>,
      })),
      layout: {
        tabs: layoutForm.tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          description: tab.description,
          position: tab.position,
          groups: tab.groups.map((group) => ({
            id: group.id,
            title: group.title,
            description: group.description,
            position: group.position,
            columns: group.columns,
            fields: group.fields.map((placement) => ({
              fieldId: placement.fieldId,
              position: placement.position,
              helpTextOverride: placement.helpTextOverride,
            })),
          })),
        })) as ReadonlyArray<unknown>,
        sidebarGroups: [] as ReadonlyArray<unknown>,
      },
    },
  };
  const renderedTokens: Array<string> = [];
  const renderer = express();
  renderer.post(
    "/api/ffd-preview",
    express.urlencoded({ extended: false, limit: "8kb" }),
    (request, response) => {
      const token =
        isRecord(request.body) && typeof request.body.token === "string" ? request.body.token : "";
      renderedTokens.push(token);
      const source =
        token === previewToken("revision")
          ? "revision"
          : token === previewToken("current")
            ? "current"
            : "invalid";
      response
        .type("html")
        .send(
          `<!doctype html><html lang="en"><head><title>Rendered preview</title></head><body><h1>Rendered ${source} preview</h1></body></html>`,
        );
    },
  );
  const revisions: Array<FixtureRevision> = [];
  const publications: Array<FixturePublication> = [];
  let publicationStateVersion = 0;
  let currentPublication: FixturePublication | null = null;
  const headRevisionId = () => revisions.at(-1)?.id ?? null;
  const recordRevision = (restoredFromRevisionId: string | null = null) => {
    const previous = revisions.at(-1) ?? null;
    const sequence = revisions.length + 1;
    revisions.push({
      id: fixtureId("d", sequence),
      sequence,
      values: localizedValues,
      previousRevisionId: previous?.id ?? null,
      restoredFromRevisionId,
      changedFieldIds: changedFields(previous?.values ?? {}, localizedValues),
      authoredAt: new Date(Date.parse(createdAt) + sequence * 60_000).toISOString(),
    });
  };
  const revisionSummary = (revision: FixtureRevision) => ({
    id: revision.id,
    scope: "localized",
    sequence: revision.sequence,
    previousRevisionId: revision.previousRevisionId,
    schemaRevisionId: contentSchemaRevisionId,
    contractHash: "a".repeat(64),
    changedFieldIds: revision.changedFieldIds,
    restoredFromRevisionId: revision.restoredFromRevisionId,
    authoredByUserId: "browser-user",
    authoredByCredentialId: null,
    authoredAt: revision.authoredAt,
    compatible: true,
  });
  const publicationSummary = (publication: FixturePublication) => ({
    id: publication.id,
    sequence: publication.sequence,
    schemaRevisionId: contentSchemaRevisionId,
    contractHash: "a".repeat(64),
    changedFieldIds: publication.changedFieldIds,
    publishedAt: publication.publishedAt,
    current: currentPublication?.id === publication.id,
  });
  const publicationStatus = () => {
    const changed =
      currentPublication !== null &&
      JSON.stringify(currentPublication.values) !== JSON.stringify(localizedValues);
    return {
      state:
        currentPublication !== null
          ? "published"
          : publicationStateVersion === 0
            ? "never_published"
            : "unpublished",
      stateVersion: publicationStateVersion,
      currentPublication:
        currentPublication === null ? null : publicationSummary(currentPublication),
      sharedChanged: false,
      localizedChanged: changed,
      schemaChanged: false,
      changedSincePublication: changed,
    };
  };
  const failure = (status: number, code: string, message: string) => ({
    status,
    body: {
      ok: false,
      data: null,
      error: { code, message, retryable: false, requestId: "browser-fixture-request" },
      message,
    },
  });
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
          host: {
            kind: "mounted",
            registration: {
              id: "11111111-1111-4111-8111-111111111111",
              version: 3,
              applicationOrigin: origin,
              mountPath: "/studio",
            },
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
  app.use("/api/studio-content/v1", express.json({ limit: "1mb", strict: true }));
  app.get(
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/context",
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
              canPublish: true,
            },
            {
              id: contentFrenchLocaleId,
              tag: "fr",
              displayName: "French",
              canRead: true,
              canWrite: true,
              canPublish: true,
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
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries",
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
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/new",
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
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/search",
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
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/resolve",
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
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries",
    (request, response) => {
      if (!isRecord(request.body)) {
        response.status(400).end();
        return;
      }
      if (typeof request.body.displayName === "string") entryName = request.body.displayName;
      applyMutations(request.body.localizedMutations);
      entryExists = true;
      recordRevision();
      response.status(200).json(
        contentEnvelope({
          entry: entry(),
          commandId: request.body.commandId,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedVersion,
          localizedRevisionId: headRevisionId(),
          validation,
        }),
      );
    },
  );
  app.get(
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId",
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
            localizedRevisionId: headRevisionId(),
            localizedValues,
            validation: request.params.locale === "fr" ? validation : currentValidation,
          },
          publication: publicationStatus(),
        }),
      ),
  );
  app.patch(
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId/name",
    (request, response) => {
      if (isRecord(request.body) && typeof request.body.displayName === "string") {
        entryName = request.body.displayName;
        nameVersion += 1;
      }
      response.json(contentEnvelope(entry()));
    },
  );
  app.patch(
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId/draft",
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
        recordRevision();
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
      recordRevision();
      response.json(
        contentEnvelope({
          entryId: contentEntryId,
          commandId: request.body.commandId,
          sharedChanged: false,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedChanged: true,
          localizedVersion,
          localizedRevisionId: headRevisionId(),
          validation: invalidValidation,
        }),
      );
    },
  );
  const presentationRoute =
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/presentation";
  app.get(presentationRoute, (_request, response) => response.json(contentEnvelope(presentation)));
  app.post(`${presentationRoute}/publish`, (request, response) => {
    if (!isRecord(request.body) || request.body.expectedRevisionId !== presentation.revisionId) {
      const stale = failure(409, "STALE_SCHEMA", "The form layout changed.");
      response.status(stale.status).json(stale.body);
      return;
    }
    const edit = isRecord(request.body.presentation) ? request.body.presentation : {};
    const sequence = presentation.sequence + 1;
    const editedFields = Array.isArray(edit.fields) ? edit.fields : [];
    presentation = {
      ...presentation,
      revisionId: fixtureId("c", sequence),
      sequence,
      presentation: {
        ...presentation.presentation,
        displayName: typeof edit.displayName === "string" ? edit.displayName : "Articles",
        fields: presentation.presentation.fields.map((field) => {
          const next = editedFields.find(
            (candidate) => isRecord(candidate) && candidate.fieldId === field.fieldId,
          );
          return isRecord(next) &&
            (typeof next.displayLabel === "string" || next.displayLabel === null)
            ? { ...field, displayLabel: next.displayLabel }
            : field;
        }),
      },
    };
    response.json(contentEnvelope({ replayed: false, noOp: false, presentation }));
  });
  const entryRoute =
    "/api/studio-content/v1/projects/:projectId/environments/:environmentId/collections/:collectionId/locales/:locale/entries/:entryId";
  app.post(`${entryRoute}/preview-handoffs`, (request, response) => {
    const source =
      isRecord(request.body) && request.body.source === "revision" ? "revision" : "current";
    response.json(
      contentEnvelope({
        token: previewToken(source),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        previewUrl: rendererPreviewUrl,
        source,
        schemaRevisionId: source === "revision" ? contentSchemaRevisionId : null,
        sharedRevisionId: null,
        localizedRevisionId: source === "revision" ? headRevisionId() : null,
      }),
    );
  });
  app.get(`${entryRoute}/revisions`, (request, response) => {
    const items =
      request.query.scope === "localized" ? revisions.toReversed().map(revisionSummary) : [];
    response.json(contentEnvelope({ items, nextCursor: null }));
  });
  app.get(`${entryRoute}/revisions/:fromRevisionId/compare/:toRevisionId`, (request, response) => {
    const from = revisions.find((revision) => revision.id === request.params.fromRevisionId);
    const to = revisions.find((revision) => revision.id === request.params.toRevisionId);
    if (from === undefined || to === undefined) {
      const missing = failure(404, "NOT_FOUND", "The revision is unavailable.");
      response.status(missing.status).json(missing.body);
      return;
    }
    response.json(
      contentEnvelope({
        from: revisionSummary(from),
        to: revisionSummary(to),
        items: changedFields(from.values, to.values).map((fieldId) => ({
          fieldId,
          change:
            from.values[fieldId] === undefined
              ? "added"
              : to.values[fieldId] === undefined
                ? "removed"
                : "changed",
          ...(from.values[fieldId] === undefined ? {} : { before: from.values[fieldId] }),
          ...(to.values[fieldId] === undefined ? {} : { after: to.values[fieldId] }),
          inCurrentSchema: true,
        })),
        restrictedChanges: false,
        schemaDiffers: false,
      }),
    );
  });
  app.get(`${entryRoute}/revisions/:revisionId`, (request, response) => {
    const revision = revisions.find((candidate) => candidate.id === request.params.revisionId);
    if (revision === undefined) {
      const missing = failure(404, "NOT_FOUND", "The revision is unavailable.");
      response.status(missing.status).json(missing.body);
      return;
    }
    response.json(
      contentEnvelope({ revision: revisionSummary(revision), values: revision.values }),
    );
  });
  app.post(`${entryRoute}/revisions/:revisionId/restore`, (request, response) => {
    const revision = revisions.find((candidate) => candidate.id === request.params.revisionId);
    if (revision === undefined || !isRecord(request.body)) {
      const missing = failure(404, "NOT_FOUND", "The revision is unavailable.");
      response.status(missing.status).json(missing.body);
      return;
    }
    if (request.body.expectedVersion !== localizedVersion) {
      const conflict = failure(409, "DRAFT_VERSION_CONFLICT", "The draft changed elsewhere.");
      response.status(conflict.status).json(conflict.body);
      return;
    }
    localizedValues = revision.values;
    localizedVersion += 1;
    recordRevision(revision.id);
    response.json(
      contentEnvelope({
        entryId: contentEntryId,
        commandId: request.body.commandId,
        sharedChanged: false,
        sharedVersion: 0,
        sharedRevisionId: null,
        localizedChanged: true,
        localizedVersion,
        localizedRevisionId: headRevisionId(),
        validation,
      }),
    );
  });
  app.get(`${entryRoute}/publication`, (_request, response) => {
    response.json(contentEnvelope(publicationStatus()));
  });
  app.get(`${entryRoute}/publications`, (_request, response) => {
    response.json(
      contentEnvelope({
        items: publications.toReversed().map(publicationSummary),
        nextCursor: null,
      }),
    );
  });
  app.post(`${entryRoute}/publication/validate`, (_request, response) => {
    const blocked = localizedValues[blockingFieldId] === "Block publication";
    response.json(
      contentEnvelope({
        authorityHash: blocked ? null : contentPublicationHash,
        stateVersion: publicationStateVersion,
        currentPublicationId: currentPublication?.id ?? null,
        schemaRevisionId: contentSchemaRevisionId,
        contractHash: "a".repeat(64),
        sharedVersion: 0,
        sharedRevisionId: null,
        localizedVersion,
        localizedRevisionId: headRevisionId(),
        wouldCreatePublication: !blocked,
        validation: blocked
          ? {
              status: "invalid",
              issues: [
                {
                  fieldId: blockingFieldId,
                  path: `field/${blockingFieldId}`,
                  scope: "localized",
                  localeId: contentLocaleId,
                  locale: "en",
                  code: "invalid_value",
                  message: "This field value is invalid.",
                },
              ],
              capped: false,
            }
          : validation,
        entryIssues: [],
      }),
    );
  });
  app.post(`${entryRoute}/publication/publish`, (request, response) => {
    if (
      !isRecord(request.body) ||
      request.body.expectedStateVersion !== publicationStateVersion ||
      request.body.expectedLocalizedVersion !== localizedVersion
    ) {
      const conflict = failure(409, "PUBLICATION_STATE_CONFLICT", "The publication state changed.");
      response.status(conflict.status).json(conflict.body);
      return;
    }
    const sequence = publications.length + 1;
    const publication: FixturePublication = {
      id: fixtureId("f", sequence),
      sequence,
      values: localizedValues,
      changedFieldIds: changedFields(currentPublication?.values ?? {}, localizedValues),
      publishedAt: new Date(Date.parse(createdAt) + sequence * 3_600_000).toISOString(),
    };
    publications.push(publication);
    currentPublication = publication;
    publicationStateVersion += 1;
    response.json(
      contentEnvelope({
        commandId: request.body.commandId,
        resultKind: "changed",
        stateVersion: publicationStateVersion,
        publication: publicationSummary(publication),
        delivery: { status: "verified", currentPublicationId: publication.id },
      }),
    );
  });
  app.post(`${entryRoute}/publication/unpublish`, (request, response) => {
    if (
      !isRecord(request.body) ||
      currentPublication === null ||
      request.body.expectedStateVersion !== publicationStateVersion ||
      request.body.expectedPublicationId !== currentPublication.id
    ) {
      const conflict = failure(409, "PUBLICATION_STATE_CONFLICT", "The publication state changed.");
      response.status(conflict.status).json(conflict.body);
      return;
    }
    const unpublishedPublicationId = currentPublication.id;
    currentPublication = null;
    publicationStateVersion += 1;
    response.json(
      contentEnvelope({
        commandId: request.body.commandId,
        resultKind: "changed",
        stateVersion: publicationStateVersion,
        unpublishedPublicationId,
        unpublishedAt: new Date().toISOString(),
        delivery: { status: "verified", currentPublicationId: null },
      }),
    );
  });

  const rendererServer = createServer(renderer);
  await new Promise<void>((resolve, reject) => {
    rendererServer.once("error", reject);
    rendererServer.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const rendererAddress = rendererServer.address();
  if (rendererAddress === null || typeof rendererAddress === "string")
    throw new Error("Studio renderer fixture bind failed.");
  const rendererPreviewUrl = `http://localhost:${rendererAddress.port}/api/ffd-preview`;
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
    previewUrl: rendererPreviewUrl,
  });
  middleware = createExpressStudioMiddleware(handler);

  return {
    origin,
    renderedTokens,
    close: async () => {
      await handler.dispose();
      await new Promise<void>((resolve, reject) => {
        rendererServer.close((error) => (error ? reject(error) : resolve()));
        rendererServer.closeAllConnections();
      });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
