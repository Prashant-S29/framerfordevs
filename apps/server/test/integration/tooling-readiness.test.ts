import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const priorOAuthRollout = process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;
process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED = "true";

const password = "M12-Tooling-Readiness-Password-123!";
const suffix = randomUUID();
const email = `m12-tooling-${suffix}@example.test`;

interface PublishedCollectionFixture {
  readonly id: string;
  readonly key: string;
  readonly revisionId: string;
  readonly contractHash: string;
}

let api: ReturnType<typeof request>;
let browser: ReturnType<typeof request.agent>;
let accessToken = "";
let issuedDeviceCode = "";
let ownerId = "";
let workspaceId = "";
let projectId = "";
let secondProjectId = "";
let environmentId = "";
let publishedCollections: ReadonlyArray<PublishedCollectionFixture> = [];
let disposeRuntime: (() => Promise<void>) | undefined;
let cleanup: (() => Promise<void>) | undefined;

function successData(response: request.Response): Record<string, unknown> {
  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({ ok: true, error: null }));
  return response.body.data;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const auth = await import("@framerfordevs/auth");
  await auth.ensureOfficialCliOAuthAuthority({ enabled: true });

  const [
    appModule,
    runtimeModule,
    dbModule,
    queryModule,
    accessSchema,
    authSchema,
    cmsSchema,
    localeSchema,
    platformSchema,
    platformServices,
    schemaServices,
    platformContracts,
    schemaContracts,
    effectModule,
  ] = await Promise.all([
    import("../../src/app"),
    import("@framerfordevs/api/runtime"),
    import("@framerfordevs/db"),
    import("@framerfordevs/db/query"),
    import("@framerfordevs/db/schema/access"),
    import("@framerfordevs/db/schema/auth"),
    import("@framerfordevs/db/schema/cms"),
    import("@framerfordevs/db/schema/locale"),
    import("@framerfordevs/db/schema/platform"),
    import("@framerfordevs/api/services/platform-repository"),
    import("@framerfordevs/api/services/schema-repository"),
    import("@framerfordevs/api/contracts/platform"),
    import("@framerfordevs/api/contracts/schemas"),
    import("effect"),
  ]);

  const app = appModule.createApp();
  api = request(app);
  browser = request.agent(app);
  disposeRuntime = runtimeModule.disposeApplicationRuntime;
  cleanup = () => deleteFixture();

  const signUp = await browser
    .post("/api/auth/sign-up/email")
    .set("Origin", "http://localhost:3001")
    .send({ name: "M12 Tooling Readiness Owner", email, password });
  expect(signUp.status).toBe(200);
  ownerId = signUp.body.user.id;

  const { Effect, Schema } = effectModule;
  const owner = Schema.decodeUnknownSync(platformContracts.AuthUserId)(ownerId);
  const platform = platformServices.makePlatformRepository();
  const schemas = schemaServices.makeSchemaRepository();
  const workspace = await Effect.runPromise(
    platform.createWorkspace(
      owner,
      Schema.decodeUnknownSync(platformContracts.CreateWorkspaceInput)({
        name: "M12 Tooling Readiness Workspace",
      }),
      `m12-tooling-workspace-${suffix}`,
    ),
  );
  workspaceId = workspace.id;

  const createProject = (name: string, key: string, requestId: string) =>
    Effect.runPromise(
      platform.createProject(
        owner,
        Schema.decodeUnknownSync(platformContracts.CreateProjectInput)({
          workspaceId,
          name,
          key,
          description: null,
        }),
        requestId,
      ),
    );

  const project = await createProject(
    "M12 Tooling Primary",
    `tooling-primary-${suffix.slice(0, 8)}`,
    `m12-tooling-project-${suffix}`,
  );
  const secondProject = await createProject(
    "M12 Tooling Secondary",
    `tooling-secondary-${suffix.slice(0, 8)}`,
    `m12-tooling-project-second-${suffix}`,
  );
  projectId = project.id;
  secondProjectId = secondProject.id;
  environmentId = project.environment.id;

  await Effect.runPromise(
    platform.enableCapability(
      owner,
      Schema.decodeUnknownSync(platformContracts.EnableCapabilityInput)({
        projectId,
        capability: "cms",
      }),
      `m12-tooling-enable-${suffix}`,
    ),
  );

  const publishCollection = async (key: string, displayName: string, fieldKey: string) => {
    const created = await Effect.runPromise(
      schemas.createCollection(
        owner,
        Schema.decodeUnknownSync(schemaContracts.CreateCollectionInput)({
          projectId,
          environmentId,
          apiKey: key,
          displayName,
          description: null,
        }),
        new Date("2026-08-22T10:00:00.000Z"),
        `m12-tooling-collection-${key}-${suffix}`,
      ),
    );
    const draft = await Effect.runPromise(
      schemas.createField(
        owner,
        Schema.decodeUnknownSync(schemaContracts.CreateCollectionFieldInput)({
          projectId,
          environmentId,
          collectionId: created.id,
          draftVersion: created.draftVersion,
          parentFieldId: null,
          field: {
            apiKey: fieldKey,
            displayLabel: fieldKey === "title" ? "Title" : "Name",
            kind: "short_text",
            required: true,
            localization: "localized",
            deprecated: false,
            editor: schemaContracts.defaultFieldEditorMetadata,
            configuration: {},
          },
        }),
        new Date("2026-08-22T10:01:00.000Z"),
        `m12-tooling-field-${key}-${suffix}`,
      ),
    );
    const scope = { projectId, environmentId, collectionId: created.id };
    const validation = await Effect.runPromise(
      schemas.validateSchema(
        owner,
        Schema.decodeUnknownSync(schemaContracts.ValidateCollectionSchemaInput)(scope),
      ),
    );
    const published = await Effect.runPromise(
      schemas.publishSchema(
        owner,
        Schema.decodeUnknownSync(schemaContracts.PublishCollectionSchemaInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          expectedPublishedRevisionId: null,
          commandId: randomUUID(),
          acknowledgedChangeIds: validation.changes.items
            .filter((change) => change.classification !== "non_breaking")
            .map((change) => change.changeId),
        }),
        new Date("2026-08-22T10:02:00.000Z"),
        `m12-tooling-publish-${key}-${suffix}`,
      ),
    );
    return {
      id: created.id,
      key,
      revisionId: published.id,
      contractHash: published.contractHash,
    };
  };

  publishedCollections = [
    await publishCollection("articles", "Articles", "title"),
    await publishCollection("authors", "Authors", "name"),
  ];

  const deviceCode = await api.post("/api/auth/device/code").send({
    client_id: auth.OFFICIAL_CLI_OAUTH_CLIENT_ID,
    scope: auth.CLI_OAUTH_SCOPES.join(" "),
    resource: (await import("@framerfordevs/env/server")).env.TOOLING_API_RESOURCE,
  });
  expect(deviceCode.status).toBe(200);
  issuedDeviceCode = deviceCode.body.device_code;
  const verification = await browser
    .get("/api/auth/device")
    .query({ user_code: deviceCode.body.user_code });
  expect(verification.status).toBe(200);
  const approval = await browser
    .post("/api/auth/device/approve")
    .set("Origin", "http://localhost:3001")
    .send({ userCode: deviceCode.body.user_code });
  expect(approval.status).toBe(200);
  const token = await api.post("/api/auth/oauth2/token").type("form").send({
    grant_type: auth.CLI_OAUTH_GRANT_TYPES[0],
    device_code: deviceCode.body.device_code,
    client_id: auth.OFFICIAL_CLI_OAUTH_CLIENT_ID,
  });
  expect(token.status).toBe(200);
  accessToken = token.body.access_token;

  async function deleteFixture() {
    const { db } = dbModule;
    if (ownerId === "") return;
    const { eq, inArray, or, sql } = queryModule;
    const projectIds = [projectId, secondProjectId];
    const collectionIds = publishedCollections.map((collection) => collection.id);

    await db
      .delete(authSchema.oauthAccessToken)
      .where(inArray(authSchema.oauthAccessToken.userId, [ownerId]));
    await db
      .delete(authSchema.oauthRefreshToken)
      .where(inArray(authSchema.oauthRefreshToken.userId, [ownerId]));
    await db
      .delete(authSchema.oauthConsent)
      .where(inArray(authSchema.oauthConsent.userId, [ownerId]));
    await db
      .delete(authSchema.deviceCode)
      .where(
        or(
          inArray(authSchema.deviceCode.userId, [ownerId]),
          eq(authSchema.deviceCode.deviceCode, issuedDeviceCode),
        ),
      );
    if (collectionIds.length > 0) {
      await db
        .delete(cmsSchema.outboxEvent)
        .where(inArray(cmsSchema.outboxEvent.subjectId, collectionIds));
      await db
        .delete(cmsSchema.cmsCollectionSchemaHead)
        .where(inArray(cmsSchema.cmsCollectionSchemaHead.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsSchemaRevisionField)
        .where(inArray(cmsSchema.cmsSchemaRevisionField.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsSchemaRevision)
        .where(inArray(cmsSchema.cmsSchemaRevision.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsCollectionDeliveryField)
        .where(inArray(cmsSchema.cmsCollectionDeliveryField.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsCollectionField)
        .where(inArray(cmsSchema.cmsCollectionField.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsCollectionDeliveryConfig)
        .where(inArray(cmsSchema.cmsCollectionDeliveryConfig.collectionId, collectionIds));
      await db
        .delete(cmsSchema.cmsCollection)
        .where(inArray(cmsSchema.cmsCollection.id, collectionIds));
    }
    await db
      .delete(platformSchema.auditEvent)
      .where(
        or(
          inArray(platformSchema.auditEvent.actorId, [ownerId]),
          inArray(platformSchema.auditEvent.projectId, projectIds),
        ),
      );
    await db
      .delete(platformSchema.projectCapability)
      .where(inArray(platformSchema.projectCapability.projectId, projectIds));
    await db
      .delete(localeSchema.projectLocale)
      .where(inArray(localeSchema.projectLocale.projectId, projectIds));
    const memberships = await db
      .select({ id: accessSchema.projectMembership.id })
      .from(accessSchema.projectMembership)
      .where(inArray(accessSchema.projectMembership.projectId, projectIds));
    const membershipIds = memberships.map((membership) => membership.id);
    if (membershipIds.length > 0)
      await db
        .delete(localeSchema.projectMembershipLocaleAccess)
        .where(inArray(localeSchema.projectMembershipLocaleAccess.membershipId, membershipIds));
    await db
      .delete(accessSchema.projectMembership)
      .where(inArray(accessSchema.projectMembership.projectId, projectIds));
    await db
      .delete(platformSchema.environment)
      .where(inArray(platformSchema.environment.projectId, projectIds));
    await db.delete(platformSchema.project).where(inArray(platformSchema.project.id, projectIds));
    await db
      .delete(platformSchema.workspaceMembership)
      .where(inArray(platformSchema.workspaceMembership.workspaceId, [workspaceId]));
    await db
      .delete(platformSchema.workspace)
      .where(inArray(platformSchema.workspace.id, [workspaceId]));
    await db.delete(authSchema.user).where(inArray(authSchema.user.id, [ownerId]));
    await db.execute(sql`select 1`);
  }
}, 60_000);

afterAll(async () => {
  try {
    await cleanup?.();
    await disposeRuntime?.();
  } finally {
    if (priorOAuthRollout === undefined) delete process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;
    else process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED = priorOAuthRollout;
  }
}, 60_000);

describe.sequential("Tooling OAuth HTTP readiness", () => {
  it("discovers OAuth-authorized projects and environments through signed continuation cursors", async () => {
    const first = await api.get("/api/tooling/v1/projects?limit=1").set(bearer(accessToken));
    const firstData = successData(first);
    expect(firstData.items).toHaveLength(1);
    expect(firstData.nextCursor).toEqual(expect.any(String));

    const second = await api
      .get(`/api/tooling/v1/projects?limit=1&cursor=${String(firstData.nextCursor)}`)
      .set(bearer(accessToken));
    const secondData = successData(second);
    expect(secondData.items).toHaveLength(1);
    expect(secondData.nextCursor).toBeNull();
    const discoveredIds = [
      ...(firstData.items as Array<{ id: string }>),
      ...(secondData.items as Array<{ id: string }>),
    ]
      .map((project) => project.id)
      .sort();
    expect(discoveredIds).toEqual([projectId, secondProjectId].sort());

    const environments = await api
      .get(`/api/tooling/v1/projects/${projectId}/environments?limit=1`)
      .set(bearer(accessToken));
    const environmentData = successData(environments);
    expect(environmentData).toEqual(
      expect.objectContaining({
        projectId,
        items: [expect.objectContaining({ id: environmentId, key: "main", primary: true })],
        nextCursor: null,
      }),
    );

    const head = await api.head("/api/tooling/v1/projects?limit=1").set(bearer(accessToken));
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
    expect(head.headers["cache-control"]).toBe("private, no-cache");
  });

  it("paginates a non-empty manifest and serves immutable revision cache semantics", async () => {
    const manifestPath = `/api/tooling/v1/projects/${projectId}/environments/main/schema/manifest`;
    const first = await api.get(`${manifestPath}?limit=1`).set(bearer(accessToken));
    const firstData = successData(first);
    expect(firstData).toEqual(
      expect.objectContaining({
        projectId,
        environmentId,
        environmentKey: "main",
        locales: [expect.objectContaining({ tag: "en" })],
        collections: [expect.any(Object)],
        nextCursor: expect.any(String),
      }),
    );
    expect(first.headers["cache-control"]).toBe("private, no-cache");
    expect(first.headers.vary).toContain("Authorization");

    const continuation = await api
      .get(`${manifestPath}?limit=1&cursor=${String(firstData.nextCursor)}`)
      .set(bearer(accessToken));
    const continuationData = successData(continuation);
    expect(continuationData.collections).toHaveLength(1);
    expect(continuationData.nextCursor).toBeNull();

    const summaries = [
      ...(firstData.collections as Array<{
        key: string;
        revisionId: string;
        contractHash: string;
      }>),
      ...(continuationData.collections as Array<{
        key: string;
        revisionId: string;
        contractHash: string;
      }>),
    ];
    expect(summaries.map((summary) => summary.key).sort()).toEqual(["articles", "authors"]);
    for (const fixture of publishedCollections) {
      expect(summaries).toContainEqual(
        expect.objectContaining({
          key: fixture.key,
          revisionId: fixture.revisionId,
          contractHash: fixture.contractHash,
        }),
      );
    }

    const summary = summaries[0];
    if (summary === undefined) throw new Error("A published Tooling summary is required.");
    const revisionPath = `${manifestPath.replace("/schema/manifest", "")}/schema/collections/${summary.key}/revisions/${summary.revisionId}`;
    const revision = await api.get(revisionPath).set(bearer(accessToken));
    const revisionData = successData(revision);
    expect(revisionData).toEqual(
      expect.objectContaining({
        projectId,
        environmentId,
        environmentKey: "main",
        collectionKey: summary.key,
        revisionId: summary.revisionId,
        contractHash: summary.contractHash,
        contract: expect.any(Object),
      }),
    );
    expect(revision.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(revision.headers.etag).toEqual(expect.any(String));
    const revisionEtag = revision.headers.etag;
    if (typeof revisionEtag !== "string") throw new Error("The revision ETag is required.");

    const revisionHead = await api.head(revisionPath).set(bearer(accessToken));
    expect(revisionHead.status).toBe(200);
    expect(revisionHead.text).toBeUndefined();
    expect(revisionHead.headers.etag).toBe(revisionEtag);

    const notModified = await api
      .get(revisionPath)
      .set(bearer(accessToken))
      .set("If-None-Match", revisionEtag);
    expect(notModified.status).toBe(304);
    expect(notModified.text).toBe("");

    const unauthenticatedConditional = await api
      .get(revisionPath)
      .set("If-None-Match", revisionEtag);
    expect(unauthenticatedConditional.status).toBe(401);
    expect(unauthenticatedConditional.body.error.code).toBe("UNAUTHORIZED");

    const { db } = await import("@framerfordevs/db");
    const { and, eq } = await import("@framerfordevs/db/query");
    const { auditEvent } = await import("@framerfordevs/db/schema/platform");
    const audits = await db
      .select()
      .from(auditEvent)
      .where(
        and(eq(auditEvent.actorId, ownerId), eq(auditEvent.action, "tooling.schema_manifest.read")),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toEqual(
      expect.objectContaining({
        actorType: "user",
        projectId,
        environmentId,
        resourceType: "environment",
        resourceId: environmentId,
      }),
    );
  });

  it("keeps representative authenticated manifest and revision reads inside existing bounds", async () => {
    const manifestPath = `/api/tooling/v1/projects/${projectId}/environments/main/schema/manifest?limit=1`;
    const summary = publishedCollections[0];
    if (summary === undefined) throw new Error("A published Tooling fixture is required.");
    const revisionPath = `/api/tooling/v1/projects/${projectId}/environments/main/schema/collections/${summary.key}/revisions/${summary.revisionId}`;
    const durations: Array<number> = [];

    for (let index = 0; index < 10; index += 1) {
      const startedAt = performance.now();
      const response = await api
        .get(index % 2 === 0 ? manifestPath : revisionPath)
        .set(bearer(accessToken));
      durations.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
      expect(Buffer.byteLength(response.text, "utf8")).toBeLessThanOrEqual(1_572_864);
    }

    durations.sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
    expect(p95).toBeDefined();
    expect(p95).toBeLessThan(750);
    console.info(
      `Tooling readiness baseline: ${durations.length} reads, p95 ${p95?.toFixed(2)} ms`,
    );
  }, 15_000);
});
