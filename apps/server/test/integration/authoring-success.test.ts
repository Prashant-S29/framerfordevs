import { randomUUID } from "node:crypto";

import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { applicationRuntime, disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  makePublicationRepository,
  PublicationRepository,
} from "@framerfordevs/api/services/publication/repository";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
import {
  makeToolingPrincipalAuthenticator,
  ToolingPrincipalAuthenticator,
} from "@framerfordevs/api/services/tooling/principal-authenticator/index";
import { db } from "@framerfordevs/db";
import { and, eq, inArray, or } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  controlPlaneCommandReceipt,
  studioRegistration,
} from "@framerfordevs/db/schema/control-plane";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionField,
  cmsCollectionLocaleDeliveryState,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleDeliveryCurrentValue,
  cmsEntryLocaleDeliverySnapshot,
  cmsEntryLocaleDraft,
  cmsEntryLocalePublication,
  cmsEntryLocalePublicationHead,
  cmsEntryLocalePublicationReference,
  cmsEntryLocaleRevision,
  cmsEntryPublicationCommand,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
  cmsEnumOptionSourceIdentity,
  cmsProjectSchemaApplyCommand,
  cmsProjectSchemaApplyRevision,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { projectLocale, projectMembershipLocaleAccess } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";

const suffix = randomUUID();
const email = `m13-authoring-http-${suffix}@example.test`;
const password = "M13-Authoring-HTTP-Password-123!";

let publicationRepositoryOverride: ReturnType<typeof makePublicationRepository> | undefined;
let rateLimitManagerOverride: RateLimitManagerService | undefined;

const downgradedOAuthAuthenticator = makeToolingPrincipalAuthenticator(
  () =>
    Effect.die(new Error("Management verification is unavailable in the OAuth downgrade test.")),
  () => Effect.succeed(null),
  () => Effect.void,
);
let toolingPrincipalAuthenticatorOverride: typeof downgradedOAuthAuthenticator | undefined;

const permissiveRateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.succeed(
      Schema.decodeUnknownSync(RateLimitDecision)({
        allowed: true,
        policy: input.policy,
        cost: input.cost,
        limit: rateLimitPolicies[input.policy].limitPerInterval,
        remaining: rateLimitPolicies[input.policy].capacity,
        resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
        retryAfterSeconds: null,
        enforcementMode: "memory",
      }),
    ),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};

const authoringEffectTransform: ApplicationEffectTransform = (effect) => {
  const withPublicationRepository =
    publicationRepositoryOverride === undefined
      ? effect
      : Effect.provideService(effect, PublicationRepository, publicationRepositoryOverride);
  const withRateLimitManager =
    rateLimitManagerOverride === undefined
      ? withPublicationRepository
      : Effect.provideService(
          withPublicationRepository,
          RateLimitManager,
          rateLimitManagerOverride,
        );
  return toolingPrincipalAuthenticatorOverride === undefined
    ? withRateLimitManager
    : Effect.provideService(
        withRateLimitManager,
        ToolingPrincipalAuthenticator,
        toolingPrincipalAuthenticatorOverride,
      );
};

const app = createApp({ authoringEffectTransform });
const api = request(app);
const browser = request.agent(app);

function resetCredentialAttemptLimit(): Promise<void> {
  return applicationRuntime.runPromise(
    Effect.flatMap(RateLimitManager, (manager) =>
      manager.reset({
        policy: "credential.verification.invalid",
        identity: "4:7f000001",
      }),
    ),
  );
}

const titleField = {
  sourceKey: "title",
  apiKey: "title",
  kind: "short_text",
  required: true,
  localization: "localized",
  configuration: {},
};
const internalNoteField = {
  sourceKey: "internal_note",
  apiKey: "internal_note",
  kind: "short_text",
  required: false,
  localization: "shared",
  configuration: {},
};
const articlesCollection = {
  sourceKey: "articles",
  apiKey: "articles",
  fields: [titleField, internalNoteField],
};
const schemaDocument = { collections: [articlesCollection] };

const breakingSchemaDocument = {
  collections: [
    {
      ...articlesCollection,
      fields: [{ ...titleField, apiKey: "headline" }, internalNoteField],
    },
  ],
};

let ownerId = "";
let workspaceId = "";
let projectId = "";
let environmentId = "";
let credentialId = "";
let managementKey = "";
let publicationCredentialId = "";
let publicationKey = "";
let adversarialKey = "";
let schemaRevisionId = "";
let contractHash = "";
let collectionId = "";
let contentEntryId = "";
let cleanup: (() => Promise<void>) | undefined;

type TestAgent = ReturnType<typeof request.agent>;

function rpc(agent: TestAgent, path: string, input: object) {
  return agent.post(`/rpc/${path}`).send({ json: input });
}

function bearer(key = managementKey) {
  return { Authorization: `Bearer ${key}` };
}

function requireValue(value: string, label: string): string {
  if (value === "") throw new Error(`${label} is not initialized.`);
  return value;
}

async function deleteFixture(): Promise<void> {
  const identifiedUsers = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const userIds = [...new Set([ownerId, ...identifiedUsers.map(({ id }) => id)].filter(Boolean))];
  const projectIds = projectId === "" ? [] : [projectId];
  const workspaceIds = workspaceId === "" ? [] : [workspaceId];

  const collectionRows =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: cmsCollection.id })
          .from(cmsCollection)
          .where(inArray(cmsCollection.projectId, projectIds));
  const collectionIds = collectionRows.map(({ id }) => id);
  const entryRows =
    collectionIds.length === 0
      ? []
      : await db
          .select({ id: cmsEntry.id })
          .from(cmsEntry)
          .where(inArray(cmsEntry.collectionId, collectionIds));
  const entryIds = entryRows.map(({ id }) => id);
  const credentialRows =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: apiCredential.id })
          .from(apiCredential)
          .where(inArray(apiCredential.projectId, projectIds));
  const credentialIds = credentialRows.map(({ id }) => id);

  await db.transaction(async (transaction) => {
    if (projectIds.length > 0 || workspaceIds.length > 0 || userIds.length > 0) {
      await transaction
        .delete(controlPlaneCommandReceipt)
        .where(
          or(
            ...(projectIds.length > 0
              ? [inArray(controlPlaneCommandReceipt.projectId, projectIds)]
              : []),
            ...(workspaceIds.length > 0
              ? [inArray(controlPlaneCommandReceipt.workspaceId, workspaceIds)]
              : []),
            ...(userIds.length > 0 ? [inArray(controlPlaneCommandReceipt.actorId, userIds)] : []),
          ),
        );
    }
    if (projectIds.length > 0) {
      await transaction
        .delete(studioRegistration)
        .where(inArray(studioRegistration.projectId, projectIds));
    }

    const outboxSubjects = [...collectionIds, ...entryIds];
    if (outboxSubjects.length > 0)
      await transaction.delete(outboxEvent).where(inArray(outboxEvent.subjectId, outboxSubjects));

    if (collectionIds.length > 0) {
      await transaction
        .delete(cmsEntryPublicationCommand)
        .where(inArray(cmsEntryPublicationCommand.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryDraftCommand)
        .where(inArray(cmsEntryDraftCommand.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocalePublicationHead)
        .where(inArray(cmsEntryLocalePublicationHead.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocaleDeliveryCurrentValue)
        .where(inArray(cmsEntryLocaleDeliveryCurrentValue.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocalePublicationReference)
        .where(
          or(
            inArray(cmsEntryLocalePublicationReference.sourceCollectionId, collectionIds),
            inArray(cmsEntryLocalePublicationReference.targetCollectionId, collectionIds),
          ),
        );
      await transaction
        .delete(cmsEntryLocaleDeliverySnapshot)
        .where(inArray(cmsEntryLocaleDeliverySnapshot.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocalePublication)
        .where(inArray(cmsEntryLocalePublication.collectionId, collectionIds));
      await transaction
        .delete(cmsEntrySharedDraft)
        .where(inArray(cmsEntrySharedDraft.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocaleDraft)
        .where(inArray(cmsEntryLocaleDraft.collectionId, collectionIds));
      await transaction
        .delete(cmsEntrySharedRevision)
        .where(inArray(cmsEntrySharedRevision.collectionId, collectionIds));
      await transaction
        .delete(cmsEntryLocaleRevision)
        .where(inArray(cmsEntryLocaleRevision.collectionId, collectionIds));
      await transaction.delete(cmsEntry).where(inArray(cmsEntry.collectionId, collectionIds));
    }

    if (projectIds.length > 0) {
      await transaction
        .delete(cmsProjectSchemaApplyRevision)
        .where(inArray(cmsProjectSchemaApplyRevision.projectId, projectIds));
      await transaction
        .delete(cmsProjectSchemaApplyCommand)
        .where(inArray(cmsProjectSchemaApplyCommand.projectId, projectIds));
    }

    if (collectionIds.length > 0) {
      await transaction
        .delete(cmsCollectionSchemaHead)
        .where(inArray(cmsCollectionSchemaHead.collectionId, collectionIds));
      await transaction
        .delete(cmsSchemaRevisionField)
        .where(inArray(cmsSchemaRevisionField.collectionId, collectionIds));
      await transaction
        .delete(cmsSchemaRevision)
        .where(inArray(cmsSchemaRevision.collectionId, collectionIds));
      await transaction
        .delete(cmsEnumOptionSourceIdentity)
        .where(inArray(cmsEnumOptionSourceIdentity.collectionId, collectionIds));
      await transaction
        .delete(cmsCollectionDeliveryField)
        .where(inArray(cmsCollectionDeliveryField.collectionId, collectionIds));
      await transaction
        .delete(cmsCollectionField)
        .where(inArray(cmsCollectionField.collectionId, collectionIds));
      await transaction
        .delete(cmsCollectionLocaleDeliveryState)
        .where(inArray(cmsCollectionLocaleDeliveryState.collectionId, collectionIds));
      await transaction
        .delete(cmsCollectionDeliveryConfig)
        .where(inArray(cmsCollectionDeliveryConfig.collectionId, collectionIds));
      await transaction.delete(cmsCollection).where(inArray(cmsCollection.id, collectionIds));
    }

    if (projectIds.length > 0 && userIds.length > 0)
      await transaction
        .delete(auditEvent)
        .where(or(inArray(auditEvent.projectId, projectIds), inArray(auditEvent.actorId, userIds)));
    else if (projectIds.length > 0)
      await transaction.delete(auditEvent).where(inArray(auditEvent.projectId, projectIds));
    else if (userIds.length > 0)
      await transaction.delete(auditEvent).where(inArray(auditEvent.actorId, userIds));

    if (credentialIds.length > 0) {
      await transaction
        .delete(apiCredentialScope)
        .where(inArray(apiCredentialScope.credentialId, credentialIds));
      await transaction.delete(apiCredential).where(inArray(apiCredential.id, credentialIds));
    }

    if (projectIds.length > 0) {
      const membershipRows = await transaction
        .select({ id: projectMembership.id })
        .from(projectMembership)
        .where(inArray(projectMembership.projectId, projectIds));
      const membershipIds = membershipRows.map(({ id }) => id);
      if (membershipIds.length > 0)
        await transaction
          .delete(projectMembershipLocaleAccess)
          .where(inArray(projectMembershipLocaleAccess.membershipId, membershipIds));
      await transaction
        .delete(projectMembership)
        .where(inArray(projectMembership.projectId, projectIds));
      await transaction
        .delete(projectCapability)
        .where(inArray(projectCapability.projectId, projectIds));
      await transaction.delete(projectLocale).where(inArray(projectLocale.projectId, projectIds));
      await transaction.delete(environment).where(inArray(environment.projectId, projectIds));
      await transaction.delete(project).where(inArray(project.id, projectIds));
    }

    if (workspaceIds.length > 0) {
      await transaction
        .delete(workspaceMembership)
        .where(inArray(workspaceMembership.workspaceId, workspaceIds));
      await transaction.delete(workspace).where(inArray(workspace.id, workspaceIds));
    }
    if (userIds.length > 0) await transaction.delete(user).where(inArray(user.id, userIds));
  });
}

async function expectFixtureAbsent(): Promise<void> {
  const users = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const projects =
    projectId === ""
      ? []
      : await db.select({ id: project.id }).from(project).where(eq(project.id, projectId));
  const receipts =
    projectId === ""
      ? []
      : await db
          .select({ commandId: cmsProjectSchemaApplyCommand.commandId })
          .from(cmsProjectSchemaApplyCommand)
          .where(eq(cmsProjectSchemaApplyCommand.projectId, projectId));
  const outbox =
    projectId === ""
      ? []
      : await db
          .select({ id: outboxEvent.id })
          .from(outboxEvent)
          .where(eq(outboxEvent.projectId, projectId));
  expect(users).toHaveLength(0);
  expect(projects).toHaveLength(0);
  expect(receipts).toHaveLength(0);
  expect(outbox).toHaveLength(0);
}

beforeAll(async () => {
  cleanup = deleteFixture;

  const signUp = await browser
    .post("/api/auth/sign-up/email")
    .set("Origin", "http://localhost:3001")
    .send({ name: "M13 Authoring HTTP Owner", email, password });
  expect(signUp.status).toBe(200);
  ownerId = signUp.body.user.id;

  const workspaceResponse = await rpc(browser, "platform/workspaces/create", {
    name: "M13 Authoring HTTP Workspace",
  });
  expect(workspaceResponse.status).toBe(200);
  workspaceId = workspaceResponse.body.json.data.id;

  const projectResponse = await rpc(browser, "platform/projects/create", {
    workspaceId,
    name: "M13 Authoring HTTP Project",
    key: `authoring-${suffix.slice(0, 8)}`,
    description: null,
  });
  expect(projectResponse.status).toBe(200);
  projectId = projectResponse.body.json.data.id;
  environmentId = projectResponse.body.json.data.environment.id;

  const capability = await rpc(browser, "platform/projects/enableCapability", {
    projectId,
    capability: "cms",
  });
  expect(capability.status).toBe(200);

  const locale = await rpc(browser, "platform/projects/locales/create", {
    projectId,
    tag: "hi",
    displayName: "Hindi",
  });
  expect(locale.status).toBe(200);

  const credential = await rpc(browser, "platform/projects/credentials/issue", {
    projectId,
    environmentId,
    family: "management",
    name: "M13 Authoring HTTP lifecycle",
    scopes: [
      "schema.read",
      "schema.write",
      "schema.publish",
      "content.read",
      "content.write",
      "content.publish",
    ],
    expiresAt: null,
  });
  expect(credential.status).toBe(200);
  credentialId = credential.body.json.data.credential.id;
  managementKey = credential.body.json.data.key;

  const publicationCredential = await rpc(browser, "platform/projects/credentials/issue", {
    projectId,
    environmentId,
    family: "management",
    name: "M13 Authoring HTTP publication lifecycle",
    scopes: ["content.read", "content.publish"],
    expiresAt: null,
  });
  expect(publicationCredential.status).toBe(200);
  publicationCredentialId = publicationCredential.body.json.data.credential.id;
  publicationKey = publicationCredential.body.json.data.key;

  const adversarialCredential = await rpc(browser, "platform/projects/credentials/issue", {
    projectId,
    environmentId,
    family: "management",
    name: "M13 Authoring HTTP adversarial authority",
    scopes: [
      "schema.read",
      "schema.write",
      "schema.publish",
      "content.read",
      "content.write",
      "content.publish",
    ],
    expiresAt: null,
  });
  expect(adversarialCredential.status).toBe(200);
  adversarialKey = adversarialCredential.body.json.data.key;
}, 60_000);

afterEach(() => {
  rateLimitManagerOverride = undefined;
  toolingPrincipalAuthenticatorOverride = undefined;
});

afterAll(async () => {
  try {
    await cleanup?.();
    await expectFixtureAbsent();
  } finally {
    await disposeApplicationRuntime();
  }
}, 60_000);

describe.sequential("Authoring successful HTTP lifecycles", () => {
  it("applies, replays, no-ops, and rejects stale, conflicting, and unacknowledged schema commands", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    const schemaBase = `/api/authoring/v1/projects/${requireValue(projectId, "project")}/environments/${requireValue(environmentId, "environment")}/schema`;
    const plan = await api
      .post(`${schemaBase}/plan`)
      .set(bearer())
      .send({ project: schemaDocument });
    expect(plan.status).toBe(200);
    expect(plan.body.data.valid).toBe(true);
    expect(plan.body.data.planHash).toMatch(/^[0-9a-f]{64}$/u);

    const acknowledgedChangeIds = plan.body.data.changes
      .filter((change: { classification: string }) => change.classification !== "non_breaking")
      .map((change: { changeId: string }) => change.changeId);
    const commandId = randomUUID();
    const applyBody = {
      project: schemaDocument,
      commandId,
      expectedCurrent: plan.body.data.current,
      expectedPlanHash: plan.body.data.planHash,
      acknowledgedChangeIds,
    };
    const applied = await api.post(`${schemaBase}/apply`).set(bearer()).send(applyBody);
    expect(applied.status).toBe(200);
    expect(applied.body.data).toMatchObject({ commandId, replayed: false, noOp: false });
    expect(applied.body.data.revisions).toHaveLength(1);
    schemaRevisionId = applied.body.data.revisions[0].revisionId;
    contractHash = applied.body.data.revisions[0].contractHash;
    collectionId = applied.body.data.revisions[0].collectionId;

    const replay = await api.post(`${schemaBase}/apply`).set(bearer()).send(applyBody);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ commandId, replayed: true, noOp: false });
    expect(replay.body.data.revisions).toEqual(applied.body.data.revisions);

    const stale = await api
      .post(`${schemaBase}/apply`)
      .set(bearer())
      .send({ ...applyBody, commandId: randomUUID() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_SCHEMA");

    const noOpPlan = await api
      .post(`${schemaBase}/plan`)
      .set(bearer())
      .send({ project: schemaDocument });
    expect(noOpPlan.status).toBe(200);
    expect(noOpPlan.body.data.valid).toBe(true);
    expect(noOpPlan.body.data.changes).toEqual([]);

    const noOpCommandId = randomUUID();
    const noOpApplyBody = {
      project: schemaDocument,
      commandId: noOpCommandId,
      expectedCurrent: noOpPlan.body.data.current,
      expectedPlanHash: noOpPlan.body.data.planHash,
      acknowledgedChangeIds: [],
    };
    const noOp = await api.post(`${schemaBase}/apply`).set(bearer()).send(noOpApplyBody);
    expect(noOp.status).toBe(200);
    expect(noOp.body.data).toMatchObject({
      commandId: noOpCommandId,
      replayed: false,
      noOp: true,
    });

    const presentationPath = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/presentation`;
    const currentPresentation = await api.get(presentationPath).set(bearer());
    expect(currentPresentation.status).toBe(200);
    expect(currentPresentation.body.data.revision).toMatchObject({
      revisionId: schemaRevisionId,
      structureHash: applied.body.data.revisions[0].structureHash,
      contractHash,
    });
    const presentationCommandId = randomUUID();
    const presentationBody = {
      commandId: presentationCommandId,
      expectedRevisionId: currentPresentation.body.data.revision.revisionId,
      expectedSequence: currentPresentation.body.data.revision.sequence,
      presentation: {
        ...currentPresentation.body.data.presentation,
        displayName: "Editorial Articles",
        description: "Presentation-only metadata",
        fields: currentPresentation.body.data.presentation.fields.map(
          (field: {
            fieldId: string;
            displayLabel: string | null;
            editor: object;
            enumOptions: ReadonlyArray<object>;
          }) => ({
            ...field,
            displayLabel:
              field.fieldId === currentPresentation.body.data.presentation.fields[0].fieldId
                ? "Headline"
                : field.displayLabel,
            editor:
              field.fieldId === currentPresentation.body.data.presentation.fields[0].fieldId
                ? { ...field.editor, helpText: "Use a concise headline." }
                : field.editor,
          }),
        ),
      },
    };
    const presentationPublished = await api
      .post(presentationPath)
      .set(bearer())
      .send(presentationBody);
    expect(presentationPublished.status).toBe(200);
    expect(presentationPublished.body.data).toMatchObject({
      commandId: presentationCommandId,
      replayed: false,
      noOp: false,
      presentation: { displayName: "Editorial Articles" },
    });
    expect(presentationPublished.body.data.revision.previousRevisionId).toBe(schemaRevisionId);
    expect(presentationPublished.body.data.revision.structureHash).toBe(
      applied.body.data.revisions[0].structureHash,
    );
    expect(presentationPublished.body.data.revision.contractHash).toBe(contractHash);
    expect(presentationPublished.body.data.revision.schemaHash).not.toBe(
      currentPresentation.body.data.revision.schemaHash,
    );
    schemaRevisionId = presentationPublished.body.data.revision.revisionId;

    const presentationReplay = await api
      .post(presentationPath)
      .set(bearer())
      .send(presentationBody);
    expect(presentationReplay.status).toBe(200);
    expect(presentationReplay.body.data).toMatchObject({
      commandId: presentationCommandId,
      replayed: true,
      noOp: false,
    });

    const stalePresentation = await api
      .post(presentationPath)
      .set(bearer())
      .send({ ...presentationBody, commandId: randomUUID() });
    expect(stalePresentation.status).toBe(409);
    expect(stalePresentation.body.error.code).toBe("STALE_SCHEMA");

    const presentationConflict = await api
      .post(presentationPath)
      .set(bearer())
      .send({
        ...presentationBody,
        presentation: { ...presentationBody.presentation, displayName: "Command conflict" },
      });
    expect(presentationConflict.status).toBe(409);
    expect(presentationConflict.body.error.code).toBe("COMMAND_CONFLICT");

    const presentationNoOp = await api.post(presentationPath).set(bearer()).send({
      commandId: randomUUID(),
      expectedRevisionId: schemaRevisionId,
      expectedSequence: presentationPublished.body.data.revision.sequence,
      presentation: presentationPublished.body.data.presentation,
    });
    expect(presentationNoOp.status).toBe(200);
    expect(presentationNoOp.body.data).toMatchObject({ noOp: true, replayed: false });
    expect(presentationNoOp.body.data.revision.revisionId).toBe(schemaRevisionId);

    const structuralPresentation = await api
      .post(presentationPath)
      .set(bearer())
      .send({
        ...presentationBody,
        commandId: randomUUID(),
        expectedRevisionId: schemaRevisionId,
        expectedSequence: presentationPublished.body.data.revision.sequence,
        presentation: { ...presentationPublished.body.data.presentation, apiKey: "forbidden" },
      });
    expect(structuralPresentation.status).toBe(400);
    expect(structuralPresentation.body.error.code).toBe("VALIDATION_ERROR");

    const commandConflict = await api
      .post(`${schemaBase}/apply`)
      .set(bearer())
      .send({ ...noOpApplyBody, commandId });
    expect(commandConflict.status).toBe(409);
    expect(commandConflict.body.error.code).toBe("COMMAND_CONFLICT");

    const breakingPlan = await api
      .post(`${schemaBase}/plan`)
      .set(bearer())
      .send({ project: breakingSchemaDocument });
    expect(breakingPlan.status).toBe(200);
    expect(breakingPlan.body.data.valid).toBe(true);
    expect(
      breakingPlan.body.data.changes.some(
        (change: { classification: string }) => change.classification === "breaking",
      ),
    ).toBe(true);
    const unacknowledged = await api.post(`${schemaBase}/apply`).set(bearer()).send({
      project: breakingSchemaDocument,
      commandId: randomUUID(),
      expectedCurrent: breakingPlan.body.data.current,
      expectedPlanHash: breakingPlan.body.data.planHash,
      acknowledgedChangeIds: [],
    });
    expect(unacknowledged.status).toBe(409);
    expect(unacknowledged.body.error.code).toBe("RISKY_ACKNOWLEDGEMENT_REQUIRED");

    const [revision] = await db
      .select({
        userId: cmsSchemaRevision.publishedByUserId,
        credentialId: cmsSchemaRevision.publishedByCredentialId,
      })
      .from(cmsSchemaRevision)
      .where(eq(cmsSchemaRevision.id, schemaRevisionId));
    const [receipt] = await db
      .select({
        userId: cmsProjectSchemaApplyCommand.completedByUserId,
        credentialId: cmsProjectSchemaApplyCommand.completedByCredentialId,
      })
      .from(cmsProjectSchemaApplyCommand)
      .where(
        and(
          eq(cmsProjectSchemaApplyCommand.projectId, projectId),
          eq(cmsProjectSchemaApplyCommand.commandId, commandId),
        ),
      );
    expect(revision).toEqual({ userId: null, credentialId });
    expect(receipt).toEqual({ userId: null, credentialId });
  });

  it("keeps representative plan/apply load and bounded-maximum planning inside measured budgets", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    const schemaBase = `/api/authoring/v1/projects/${requireValue(projectId, "project")}/environments/${requireValue(environmentId, "environment")}/schema`;
    const planDurations: Array<number> = [];
    const applyDurations: Array<number> = [];
    let currentPlan: { current: unknown; planHash: string } | undefined;

    for (let index = 0; index < 12; index += 1) {
      const startedAt = performance.now();
      const response = await api
        .post(`${schemaBase}/plan`)
        .set(bearer())
        .send({ project: schemaDocument });
      planDurations.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
      expect(Buffer.byteLength(response.text, "utf8")).toBeLessThanOrEqual(4_194_304);
      currentPlan = response.body.data;
    }
    if (currentPlan === undefined) throw new Error("A representative schema plan is required.");

    for (let index = 0; index < 6; index += 1) {
      const startedAt = performance.now();
      const response = await api.post(`${schemaBase}/apply`).set(bearer()).send({
        project: schemaDocument,
        commandId: randomUUID(),
        expectedCurrent: currentPlan.current,
        expectedPlanHash: currentPlan.planHash,
        acknowledgedChangeIds: [],
      });
      applyDurations.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
      expect(response.body.data.noOp).toBe(true);
      expect(Buffer.byteLength(response.text, "utf8")).toBeLessThanOrEqual(4_194_304);
    }

    const boundedMaximumProject = {
      collections: [
        articlesCollection,
        ...Array.from({ length: 49 }, (_, collectionIndex) => ({
          sourceKey: `load_collection_${collectionIndex}`,
          apiKey: `load_collection_${collectionIndex}`,
          fields: Array.from({ length: 50 }, (_, fieldIndex) => ({
            sourceKey: `load_field_${fieldIndex}`,
            apiKey: `load_field_${fieldIndex}`,
            kind: "short_text",
            required: false,
            localization: "localized",
            configuration: {},
          })),
        })),
      ],
    };
    const boundaryRequestBytes = Buffer.byteLength(
      JSON.stringify({ project: boundedMaximumProject }),
      "utf8",
    );
    expect(boundaryRequestBytes).toBeLessThanOrEqual(1_048_576);
    const boundaryStartedAt = performance.now();
    const boundary = await api
      .post(`${schemaBase}/plan`)
      .set(bearer())
      .send({ project: boundedMaximumProject });
    const boundaryDuration = performance.now() - boundaryStartedAt;
    expect(boundary.status).toBe(200);
    expect(boundary.body.data.valid).toBe(true);
    expect(Buffer.byteLength(boundary.text, "utf8")).toBeLessThanOrEqual(4_194_304);

    const percentile95 = (durations: ReadonlyArray<number>) =>
      [...durations].sort((left, right) => left - right)[Math.ceil(durations.length * 0.95) - 1];
    const planP95 = percentile95(planDurations);
    const applyP95 = percentile95(applyDurations);
    expect(planP95).toBeDefined();
    expect(applyP95).toBeDefined();
    expect(planP95).toBeLessThan(1_000);
    expect(applyP95).toBeLessThan(1_500);
    expect(boundaryDuration).toBeLessThan(5_000);
    console.info(
      `Authoring load baseline: ${planDurations.length} plans p95 ${planP95?.toFixed(2)} ms; ${applyDurations.length} no-op applies p95 ${applyP95?.toFixed(2)} ms; 50-collection/2,452-field boundary ${boundaryDuration.toFixed(2)} ms at ${boundaryRequestBytes} request bytes`,
    );
  }, 30_000);

  it("runs the complete exact-locale draft and publication lifecycle with replay and conflict authority", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    const entriesBase = `/api/authoring/v1/projects/${requireValue(projectId, "project")}/environments/${requireValue(environmentId, "environment")}/collections/articles/locales/en/entries`;
    const createCommandId = randomUUID();
    const createBody = {
      displayName: "HTTP lifecycle article",
      schemaRevisionId: requireValue(schemaRevisionId, "schema revision"),
      contractHash: requireValue(contractHash, "contract hash"),
      commandId: createCommandId,
      mutations: [
        { operation: "set", scope: "localized", path: ["title"], value: "Initial title" },
        { operation: "set", scope: "shared", path: ["internal_note"], value: "Initial note" },
      ],
    };
    const created = await api.post(entriesBase).set(bearer()).send(createBody);
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      commandId: createCommandId,
      sharedVersion: 1,
      localizedVersion: 1,
      validation: { valid: true },
    });
    const entryId = created.body.data.entry.id;
    contentEntryId = entryId;

    const createReplay = await api.post(entriesBase).set(bearer()).send(createBody);
    expect(createReplay.status).toBe(200);
    expect(createReplay.body.data).toEqual(created.body.data);

    const listed = await api.get(`${entriesBase}?limit=10`).set(bearer());
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toEqual([
      expect.objectContaining({ id: entryId, displayName: "HTTP lifecycle article" }),
    ]);
    expect(listed.body.data.nextCursor).toBeNull();

    const draftPath = `${entriesBase}/${entryId}/draft`;
    const initialDraft = await api.get(draftPath).set(bearer());
    expect(initialDraft.status).toBe(200);
    expect(initialDraft.body.data).toMatchObject({
      locale: "en",
      schemaRevisionId,
      contractHash,
      sharedVersion: 1,
      sharedValues: { internal_note: "Initial note" },
      localizedVersion: 1,
      localizedValues: { title: "Initial title" },
    });

    const rename = await api
      .patch(`${entriesBase}/${entryId}`)
      .set(bearer())
      .send({ displayName: "Renamed lifecycle article", expectedNameVersion: 1 });
    expect(rename.status).toBe(200);
    expect(rename.body.data).toMatchObject({
      id: entryId,
      displayName: "Renamed lifecycle article",
      nameVersion: 2,
    });

    const staleRename = await api
      .patch(`${entriesBase}/${entryId}`)
      .set(bearer())
      .send({ displayName: "Stale rename", expectedNameVersion: 1 });
    expect(staleRename.status).toBe(409);
    expect(staleRename.body.error.code).toBe("DRAFT_CONFLICT");

    const saveCommandId = randomUUID();
    const saveBody = {
      schemaRevisionId,
      contractHash,
      commandId: saveCommandId,
      expectedSharedVersion: 1,
      expectedLocalizedVersion: 1,
      mutations: [
        { operation: "set", scope: "localized", path: ["title"], value: "Updated title" },
        { operation: "set", scope: "shared", path: ["internal_note"], value: "Updated note" },
      ],
    };
    const saved = await api.patch(draftPath).set(bearer()).send(saveBody);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      commandId: saveCommandId,
      sharedChanged: true,
      sharedVersion: 2,
      localizedChanged: true,
      localizedVersion: 2,
      validation: { valid: true },
    });

    const saveReplay = await api.patch(draftPath).set(bearer()).send(saveBody);
    expect(saveReplay.status).toBe(200);
    expect(saveReplay.body.data).toEqual(saved.body.data);

    const saveCommandConflict = await api
      .patch(draftPath)
      .set(bearer())
      .send({
        ...saveBody,
        mutations: [
          { operation: "set", scope: "localized", path: ["title"], value: "Conflicting title" },
        ],
      });
    expect(saveCommandConflict.status).toBe(409);
    expect(saveCommandConflict.body.error.code).toBe("COMMAND_CONFLICT");

    const staleSave = await api
      .patch(draftPath)
      .set(bearer())
      .send({ ...saveBody, commandId: randomUUID() });
    expect(staleSave.status).toBe(409);
    expect(staleSave.body.error.code).toBe("DRAFT_CONFLICT");

    const currentDraft = await api.get(draftPath).set(bearer());
    expect(currentDraft.status).toBe(200);
    expect(currentDraft.body.data).toMatchObject({
      sharedVersion: 2,
      sharedValues: { internal_note: "Updated note" },
      localizedVersion: 2,
      localizedValues: { title: "Updated title" },
    });

    const publicationPath = `${entriesBase}/${entryId}/publication`;
    const validation = await api
      .post(`${publicationPath}/validate`)
      .set(bearer(requireValue(publicationKey, "publication credential")))
      .send({});
    expect(validation.status).toBe(200);
    expect(validation.body.data).toMatchObject({
      entryId,
      locale: "en",
      valid: true,
      wouldCreatePublication: true,
    });

    const hindiEntriesBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/locales/hi/entries`;
    const hindiDraft = await api.get(`${hindiEntriesBase}/${entryId}/draft`).set(bearer());
    expect(hindiDraft.status).toBe(200);
    expect(hindiDraft.body.data).toMatchObject({
      locale: "hi",
      sharedVersion: 2,
      sharedValues: { internal_note: "Updated note" },
      localizedVersion: 0,
      localizedValues: {},
    });
    const publicationBearer = bearer(requireValue(publicationKey, "publication credential"));
    const hindiStatus = await api
      .get(`${hindiEntriesBase}/${entryId}/publication`)
      .set(publicationBearer);
    expect(hindiStatus.status).toBe(200);
    expect(hindiStatus.body.data).toMatchObject({ locale: "hi", state: "unpublished" });

    const englishStatus = await api.get(publicationPath).set(publicationBearer);
    expect(englishStatus.status).toBe(200);
    expect(englishStatus.body.data).toMatchObject({
      entryId,
      locale: "en",
      state: "unpublished",
      stateVersion: 0,
      currentPublication: null,
      currentSharedVersion: 2,
      currentLocalizedVersion: 2,
    });

    let reachedPublicationRollback = false;
    let publicationAttributionVerified = false;
    try {
      await db.transaction(async (transaction) => {
        publicationRepositoryOverride = makePublicationRepository({
          executor: transaction,
          runTransaction: (work) => work(transaction),
        });
        const publishCommandId = randomUUID();
        const publishBody = {
          commandId: publishCommandId,
          authorityHash: validation.body.data.authorityHash,
          expectedStateVersion: validation.body.data.stateVersion,
          expectedPublicationId: validation.body.data.currentPublicationId,
          expectedSchemaRevisionId: validation.body.data.schemaRevisionId,
          expectedContractHash: validation.body.data.contractHash,
          expectedSharedVersion: validation.body.data.sharedVersion,
          expectedSharedRevisionId: validation.body.data.sharedRevisionId,
          expectedLocalizedVersion: validation.body.data.localizedVersion,
          expectedLocalizedRevisionId: validation.body.data.localizedRevisionId,
        };
        const published = await api
          .post(`${publicationPath}/publish`)
          .set(publicationBearer)
          .send(publishBody);
        expect(published.status).toBe(200);
        expect(published.body.data).toMatchObject({
          entryId,
          locale: "en",
          commandId: publishCommandId,
          stateVersion: 1,
          resultKind: "changed",
          publication: { current: true, sequence: 1 },
        });

        const publishReplay = await api
          .post(`${publicationPath}/publish`)
          .set(publicationBearer)
          .send(publishBody);
        expect(publishReplay.status).toBe(200);
        expect(publishReplay.body.data).toEqual(published.body.data);

        const publishCommandConflict = await api
          .post(`${publicationPath}/publish`)
          .set(publicationBearer)
          .send({ ...publishBody, expectedStateVersion: publishBody.expectedStateVersion + 1 });
        expect(publishCommandConflict.status).toBe(409);
        expect(publishCommandConflict.body.error.code).toBe("COMMAND_CONFLICT");

        const publishedStatus = await api.get(publicationPath).set(publicationBearer);
        expect(publishedStatus.status).toBe(200);
        expect(publishedStatus.body.data).toMatchObject({
          entryId,
          locale: "en",
          state: "published",
          stateVersion: 1,
          changedSincePublication: false,
        });
        const publicationId = publishedStatus.body.data.currentPublication.id;
        const unpublishCommandId = randomUUID();
        const unpublishBody = {
          commandId: unpublishCommandId,
          expectedStateVersion: publishedStatus.body.data.stateVersion,
          expectedPublicationId: publicationId,
        };
        const unpublished = await api
          .post(`${publicationPath}/unpublish`)
          .set(publicationBearer)
          .send(unpublishBody);
        expect(unpublished.status).toBe(200);
        expect(unpublished.body.data).toMatchObject({
          entryId,
          locale: "en",
          commandId: unpublishCommandId,
          stateVersion: 2,
          resultKind: "changed",
          unpublishedPublicationId: publicationId,
        });

        const unpublishReplay = await api
          .post(`${publicationPath}/unpublish`)
          .set(publicationBearer)
          .send(unpublishBody);
        expect(unpublishReplay.status).toBe(200);
        expect(unpublishReplay.body.data).toEqual(unpublished.body.data);

        const unpublishCommandConflict = await api
          .post(`${publicationPath}/unpublish`)
          .set(publicationBearer)
          .send({ ...unpublishBody, expectedStateVersion: unpublishBody.expectedStateVersion + 1 });
        expect(unpublishCommandConflict.status).toBe(409);
        expect(unpublishCommandConflict.body.error.code).toBe("COMMAND_CONFLICT");

        const finalStatus = await api.get(publicationPath).set(publicationBearer);
        expect(finalStatus.status).toBe(200);
        expect(finalStatus.body.data).toMatchObject({
          entryId,
          locale: "en",
          state: "unpublished",
          stateVersion: 2,
          currentPublication: null,
        });

        const [publicationActor] = await transaction
          .select({
            userId: cmsEntryLocalePublication.publishedByUserId,
            credentialId: cmsEntryLocalePublication.publishedByCredentialId,
          })
          .from(cmsEntryLocalePublication)
          .where(eq(cmsEntryLocalePublication.id, publicationId));
        expect(publicationActor).toEqual({
          userId: null,
          credentialId: publicationCredentialId,
        });
        publicationAttributionVerified = true;
        reachedPublicationRollback = true;
        transaction.rollback();
      });
    } catch (cause) {
      if (!reachedPublicationRollback) throw cause;
    } finally {
      publicationRepositoryOverride = undefined;
    }
    expect(reachedPublicationRollback).toBe(true);
    expect(publicationAttributionVerified).toBe(true);
    const rolledBackPublications = await db
      .select({ id: cmsEntryLocalePublication.id })
      .from(cmsEntryLocalePublication)
      .where(eq(cmsEntryLocalePublication.entryId, entryId));
    const rolledBackCommands = await db
      .select({ commandId: cmsEntryPublicationCommand.commandId })
      .from(cmsEntryPublicationCommand)
      .where(eq(cmsEntryPublicationCommand.entryId, entryId));
    expect(rolledBackPublications).toHaveLength(0);
    expect(rolledBackCommands).toHaveLength(0);

    const [entryActor] = await db
      .select({
        createdByUserId: cmsEntry.createdByUserId,
        createdByCredentialId: cmsEntry.createdByCredentialId,
        changedByUserId: cmsEntry.changedByUserId,
        changedByCredentialId: cmsEntry.changedByCredentialId,
      })
      .from(cmsEntry)
      .where(eq(cmsEntry.id, entryId));
    const revisions = await db
      .select({
        userId: cmsEntryLocaleRevision.authoredByUserId,
        credentialId: cmsEntryLocaleRevision.authoredByCredentialId,
      })
      .from(cmsEntryLocaleRevision)
      .where(eq(cmsEntryLocaleRevision.entryId, entryId));
    const credentialAudits = await db
      .select({ actorType: auditEvent.actorType, actorId: auditEvent.actorId })
      .from(auditEvent)
      .where(and(eq(auditEvent.projectId, projectId), eq(auditEvent.actorId, credentialId)));

    expect(entryActor).toEqual({
      createdByUserId: null,
      createdByCredentialId: credentialId,
      changedByUserId: null,
      changedByCredentialId: credentialId,
    });
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions.every((revision) => revision.userId === null)).toBe(true);
    expect(revisions.every((revision) => revision.credentialId === credentialId)).toBe(true);
    expect(credentialAudits.length).toBeGreaterThan(0);
    expect(
      credentialAudits.every(
        (audit) => audit.actorType === "credential" && audit.actorId === credentialId,
      ),
    ).toBe(true);
    expect(credentialAudits.some((audit) => audit.actorId === ownerId)).toBe(false);
    expect(collectionId).not.toBe("");
  }, 20_000);

  it("rejects foreign authority and revoked, expired, rotated, or wrong-family credentials", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    const foreignProjectId = randomUUID();
    const foreignEnvironmentId = randomUUID();
    const foreignEntryId = randomUUID();
    const foreignSchemaBase = `/api/authoring/v1/projects/${foreignProjectId}/environments/${foreignEnvironmentId}/schema`;
    const foreignEntriesBase = `/api/authoring/v1/projects/${foreignProjectId}/environments/${foreignEnvironmentId}/collections/articles/locales/en/entries`;
    const foreignPresentationPath = foreignEntriesBase.replace(
      "/locales/en/entries",
      "/presentation",
    );
    const foreignEntryPath = `${foreignEntriesBase}/${foreignEntryId}`;
    const foreignPublicationPath = `${foreignEntryPath}/publication`;
    const sourcedBearer = (key: string, source: string) => ({
      ...bearer(key),
      "X-Forwarded-For": source,
    });
    const foreignBearer = sourcedBearer(
      requireValue(adversarialKey, "adversarial credential"),
      "198.51.100.10",
    );
    const hash = "a".repeat(64);
    const schemaAuthority = { projectManifestHash: hash, revisionIds: {} };
    const entryCommand = randomUUID();
    const ownPresentationPath = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/presentation`;
    const ownPresentation = await api.get(ownPresentationPath).set(foreignBearer);
    expect(ownPresentation.status).toBe(200);
    const foreignRequests = [
      api.get(`${foreignSchemaBase}/export`).set(foreignBearer),
      api.post(`${foreignSchemaBase}/plan`).set(foreignBearer).send({ project: schemaDocument }),
      api.post(`${foreignSchemaBase}/apply`).set(foreignBearer).send({
        project: schemaDocument,
        commandId: randomUUID(),
        expectedCurrent: schemaAuthority,
        expectedPlanHash: hash,
        acknowledgedChangeIds: [],
      }),
      api.get(`${foreignEntriesBase.replace("/locales/en/entries", "/form")}`).set(foreignBearer),
      api.get(foreignPresentationPath).set(foreignBearer),
      api.post(foreignPresentationPath).set(foreignBearer).send({
        commandId: randomUUID(),
        expectedRevisionId: ownPresentation.body.data.revision.revisionId,
        expectedSequence: ownPresentation.body.data.revision.sequence,
        presentation: ownPresentation.body.data.presentation,
      }),
      api.get(`${foreignEntriesBase}?limit=10`).set(foreignBearer),
      api.post(foreignEntriesBase).set(foreignBearer).send({
        displayName: "Foreign entry",
        schemaRevisionId,
        contractHash,
        commandId: entryCommand,
        mutations: [],
      }),
      api
        .patch(foreignEntryPath)
        .set(foreignBearer)
        .send({ displayName: "Foreign rename", expectedNameVersion: 1 }),
      api.get(`${foreignEntryPath}/draft`).set(foreignBearer),
      api
        .patch(`${foreignEntryPath}/draft`)
        .set(foreignBearer)
        .send({
          schemaRevisionId,
          contractHash,
          commandId: entryCommand,
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "Foreign" }],
        }),
      api.get(foreignPublicationPath).set(foreignBearer),
      api.post(`${foreignPublicationPath}/validate`).set(foreignBearer).send({}),
      api.post(`${foreignPublicationPath}/publish`).set(foreignBearer).send({
        commandId: entryCommand,
        authorityHash: hash,
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: schemaRevisionId,
        expectedContractHash: contractHash,
        expectedSharedVersion: 0,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 0,
        expectedLocalizedRevisionId: null,
      }),
      api.post(`${foreignPublicationPath}/unpublish`).set(foreignBearer).send({
        commandId: entryCommand,
        expectedStateVersion: 0,
        expectedPublicationId: null,
      }),
    ];
    for (const [index, pending] of foreignRequests.entries()) {
      const response = await pending;
      expect(response.status, `foreign operation ${index}`).toBe(404);
      expect(response.body.error.code, `foreign operation ${index}`).toBe("NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain(foreignProjectId);
      expect(JSON.stringify(response.body)).not.toContain(adversarialKey);
    }

    const ownEntriesBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/locales/en/entries`;
    const wrongEnvironment = await api
      .get(
        `/api/authoring/v1/projects/${projectId}/environments/${randomUUID()}/collections/articles/locales/en/entries`,
      )
      .set(foreignBearer);
    const missingCollection = await api
      .get(
        `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/missing_articles/locales/en/entries`,
      )
      .set(foreignBearer);
    const unavailableLocale = await api
      .get(
        `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/locales/zu/entries`,
      )
      .set(foreignBearer);
    expect(wrongEnvironment.status).toBe(404);
    expect(wrongEnvironment.body.error.code).toBe("NOT_FOUND");
    expect(missingCollection.status).toBe(404);
    expect(missingCollection.body.error.code).toBe("NOT_FOUND");
    expect(unavailableLocale.status).toBe(404);
    expect(unavailableLocale.body.error.code).toBe("LOCALE_UNAVAILABLE");

    await resetCredentialAttemptLimit();
    const rotating = await rpc(browser, "platform/projects/credentials/issue", {
      projectId,
      environmentId,
      family: "management",
      name: "M13 rotating Authoring credential",
      scopes: ["content.read"],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(rotating.status).toBe(200);
    const rotatingKey = rotating.body.json.data.key;
    const rotatingCredential = rotating.body.json.data.credential;
    const rotationSource = "198.51.100.11";
    const beforeRotation = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(rotatingKey, rotationSource));
    expect(beforeRotation.status).toBe(200);

    const rotated = await rpc(browser, "platform/projects/credentials/rotate", {
      credentialId: rotatingCredential.id,
      version: rotatingCredential.version,
    });
    expect(rotated.status).toBe(200);
    const rotatedKey = rotated.body.json.data.key;
    const rotatedCredential = rotated.body.json.data.credential;
    const predecessor = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(rotatingKey, rotationSource));
    const successor = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(rotatedKey, rotationSource));
    expect(predecessor.status).toBe(401);
    expect(predecessor.body.error.code).toBe("CREDENTIAL_INVALID");
    expect(successor.status).toBe(200);

    const revoked = await rpc(browser, "platform/projects/credentials/revoke", {
      credentialId: rotatedCredential.id,
      version: rotatedCredential.version,
    });
    expect(revoked.status).toBe(200);
    const revokedRead = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(rotatedKey, rotationSource));
    expect(revokedRead.status).toBe(401);
    expect(revokedRead.body.error.code).toBe("CREDENTIAL_INVALID");

    const expiring = await rpc(browser, "platform/projects/credentials/issue", {
      projectId,
      environmentId,
      family: "management",
      name: "M13 expired Authoring credential",
      scopes: ["content.read"],
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(expiring.status).toBe(200);
    const expiringKey = expiring.body.json.data.key;
    const expiringCredentialId = expiring.body.json.data.credential.id;
    const expirationNow = Date.now();
    await db
      .update(apiCredential)
      .set({
        createdAt: new Date(expirationNow - 120_000),
        expiresAt: new Date(expirationNow - 60_000),
      })
      .where(eq(apiCredential.id, expiringCredentialId));
    const expiredRead = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(expiringKey, "198.51.100.12"));
    expect(expiredRead.status).toBe(401);
    expect(expiredRead.body.error.code).toBe("CREDENTIAL_INVALID");

    const delivery = await rpc(browser, "platform/projects/credentials/issue", {
      projectId,
      environmentId,
      family: "delivery",
      name: "M13 wrong-family Authoring credential",
      scopes: ["delivery.read"],
      expiresAt: null,
    });
    expect(delivery.status).toBe(200);
    const wrongFamily = await api
      .get(`${ownEntriesBase}?limit=1`)
      .set(sourcedBearer(delivery.body.json.data.key, "198.51.100.13"));
    expect(wrongFamily.status).toBe(401);
    expect(wrongFamily.body.error.code).toBe("CREDENTIAL_INVALID");
  }, 20_000);

  it("rejects excess mutation authority and raw or encoded traversal without side effects", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    await resetCredentialAttemptLimit();
    const key = requireValue(adversarialKey, "adversarial credential");
    const authorization = bearer(key);
    const schemaBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/schema`;
    const entriesBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/locales/en/entries`;
    const entryPath = `${entriesBase}/${requireValue(contentEntryId, "content entry")}`;
    const draftPath = `${entryPath}/draft`;
    const publicationPath = `${entryPath}/publication`;
    const presentationPath = entriesBase.replace("/locales/en/entries", "/presentation");
    const hash = "a".repeat(64);
    const leakedValue = "Never leak this value";
    const excessRequests = [
      api
        .post(`${schemaBase}/plan`)
        .set(authorization)
        .send({ project: schemaDocument, extra: true }),
      api
        .post(`${schemaBase}/apply`)
        .set(authorization)
        .send({
          project: schemaDocument,
          commandId: randomUUID(),
          expectedCurrent: { projectManifestHash: hash, revisionIds: {} },
          expectedPlanHash: hash,
          acknowledgedChangeIds: [],
          extra: true,
        }),
      api.post(presentationPath).set(authorization).send({ extra: true }),
      api.post(entriesBase).set(authorization).send({
        displayName: "Excess entry",
        schemaRevisionId,
        contractHash,
        commandId: randomUUID(),
        mutations: [],
        extra: leakedValue,
      }),
      api
        .patch(entryPath)
        .set(authorization)
        .send({ displayName: "Excess rename", expectedNameVersion: 2, extra: true }),
      api
        .patch(draftPath)
        .set(authorization)
        .send({
          schemaRevisionId,
          contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: 2,
          expectedLocalizedVersion: 2,
          mutations: [
            { operation: "set", scope: "localized", path: ["title"], value: leakedValue },
          ],
          extra: true,
        }),
      api.post(`${publicationPath}/validate`).set(authorization).send({ extra: true }),
      api.post(`${publicationPath}/publish`).set(authorization).send({
        commandId: randomUUID(),
        authorityHash: hash,
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: schemaRevisionId,
        expectedContractHash: contractHash,
        expectedSharedVersion: 2,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 2,
        expectedLocalizedRevisionId: null,
        extra: true,
      }),
      api.post(`${publicationPath}/unpublish`).set(authorization).send({
        commandId: randomUUID(),
        expectedStateVersion: 0,
        expectedPublicationId: null,
        extra: true,
      }),
    ];
    for (const [index, pending] of excessRequests.entries()) {
      const response = await pending;
      expect(response.status, `excess mutation ${index}`).toBe(400);
      expect(response.body.error.code, `excess mutation ${index}`).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(response.body)).not.toContain(leakedValue);
    }

    const traversalPaths = [
      `/api/authoring/v1/projects/%2e%2e/environments/${environmentId}/schema/export`,
      `/api/authoring/v1/projects/%252e%252e/environments/${environmentId}/schema/export`,
      `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/%2e%2e/locales/en/entries`,
      `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles%2F..%2Fforeign/locales/en/entries`,
      `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/../locales/en/entries`,
    ];
    for (const path of traversalPaths) {
      const response = await api.get(path).set(authorization).redirects(0);
      expect([400, 404]).toContain(response.status);
      expect(["VALIDATION_ERROR", "NOT_FOUND"]).toContain(response.body.error.code);
      expect(response.headers.location).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(key);
    }
  }, 20_000);

  it("rejects OAuth scope downgrade before every Authoring operation", async () => {
    rateLimitManagerOverride = permissiveRateLimitManager;
    toolingPrincipalAuthenticatorOverride = downgradedOAuthAuthenticator;
    const authorization = { Authorization: "Bearer downgraded.oauth.token" };
    const schemaBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/schema`;
    const entriesBase = `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/locales/en/entries`;
    const entryPath = `${entriesBase}/${requireValue(contentEntryId, "content entry")}`;
    const publicationPath = `${entryPath}/publication`;
    const presentationPath = entriesBase.replace("/locales/en/entries", "/presentation");
    const hash = "a".repeat(64);
    const commandId = randomUUID();
    const requests = [
      api.get(`${schemaBase}/export`).set(authorization),
      api.post(`${schemaBase}/plan`).set(authorization).send({ project: schemaDocument }),
      api
        .post(`${schemaBase}/apply`)
        .set(authorization)
        .send({
          project: schemaDocument,
          commandId,
          expectedCurrent: { projectManifestHash: hash, revisionIds: {} },
          expectedPlanHash: hash,
          acknowledgedChangeIds: [],
        }),
      api
        .get(
          `/api/authoring/v1/projects/${projectId}/environments/${environmentId}/collections/articles/form`,
        )
        .set(authorization),
      api.get(presentationPath).set(authorization),
      api.post(presentationPath).set(authorization).send({}),
      api.get(`${entriesBase}?limit=1`).set(authorization),
      api.post(entriesBase).set(authorization).send({
        displayName: "OAuth downgrade",
        schemaRevisionId,
        contractHash,
        commandId,
        mutations: [],
      }),
      api
        .patch(entryPath)
        .set(authorization)
        .send({ displayName: "OAuth downgrade", expectedNameVersion: 2 }),
      api.get(`${entryPath}/draft`).set(authorization),
      api
        .patch(`${entryPath}/draft`)
        .set(authorization)
        .send({
          schemaRevisionId,
          contractHash,
          commandId,
          expectedSharedVersion: 2,
          expectedLocalizedVersion: 2,
          mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "Denied" }],
        }),
      api.get(publicationPath).set(authorization),
      api.post(`${publicationPath}/validate`).set(authorization).send({}),
      api.post(`${publicationPath}/publish`).set(authorization).send({
        commandId,
        authorityHash: hash,
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: schemaRevisionId,
        expectedContractHash: contractHash,
        expectedSharedVersion: 2,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 2,
        expectedLocalizedRevisionId: null,
      }),
      api
        .post(`${publicationPath}/unpublish`)
        .set(authorization)
        .send({ commandId, expectedStateVersion: 0, expectedPublicationId: null }),
    ];
    for (const pending of requests) {
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("CREDENTIAL_INVALID");
      expect(response.headers["www-authenticate"]).toBe('Bearer realm="authoring"');
      expect(JSON.stringify(response.body)).not.toContain("downgraded.oauth.token");
    }
  }, 20_000);
});
