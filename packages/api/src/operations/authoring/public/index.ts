// Orchestrates bearer-only Authoring schema plan/apply with strict public inputs and typed decisions.

import {
  AUTHORING_CONTENT_PUBLISH_SCOPE,
  AUTHORING_DRAFT_WRITE_SCOPE,
  AUTHORING_READ_SCOPE,
  AUTHORING_SCHEMA_PUSH_SCOPE,
  type CliApiOAuthScope,
} from "@framerfordevs/auth";
import { Clock, Effect, Schema } from "effect";

import type { CredentialScope } from "../../../contracts/access";
import { ApiErrorDetail } from "../../../contracts/response/api";
import { AuthoringProjectScope, CmsActor } from "../../../contracts/authoring";
import {
  AuthoringCreateEntryRequest,
  AuthoringCreateEntryResult,
  AuthoringEntryPage,
  AuthoringEntryScope,
  AuthoringEntryValidation,
  AuthoringEntryValidationIssue,
  AuthoringListEntriesQuery,
  AuthoringRenameEntryRequest,
  AuthoringSaveEntryDraftRequest,
  AuthoringSaveEntryDraftResult,
} from "../../../contracts/authoring/content";
import {
  AuthoringPublishPresentationRequest,
  type AuthoringPublishPresentationRequest as AuthoringPublishPresentationRequestType,
} from "../../../contracts/authoring/presentation";
import {
  AuthoringPublicationPlan,
  AuthoringPublicationStatus,
  AuthoringPublicationSummary,
  AuthoringPublishEntryRequest,
  AuthoringPublishEntryResult,
  AuthoringUnpublishEntryRequest,
  AuthoringUnpublishEntryResult,
  AuthoringValidatePublicationRequest,
} from "../../../contracts/authoring/publication";
import {
  AuthoringSchemaApplyInput,
  AuthoringSchemaApplyRequest,
  AuthoringSchemaExportInput,
  AuthoringSchemaPlanInput,
  AuthoringSchemaPlanRequest,
} from "../../../contracts/authoring/schema";
import {
  AuthoringCommandConflictFailure,
  AuthoringDraftConflictFailure,
  AuthoringPublicationConflictFailure,
  AuthoringPublicationInvalidFailure,
  AuthoringRiskyAcknowledgementRequiredFailure,
  AuthoringSourceIdentityConflictFailure,
  AuthoringStaleSchemaFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from "../../../contracts/response/errors";
import {
  GetEntryPublicationStatusInput,
  PublishEntryInput,
  UnpublishEntryInput,
  ValidateEntryPublicationInput,
  type EntryPublicationPlan,
  type EntryPublicationStatus,
  type EntryPublicationSummary,
} from "../../../contracts/publication";
import { RateLimitCost } from "../../../contracts/rate-limit";
import { AuthUserId } from "../../../contracts/platform";
import {
  CreateEntryWithDraftInput,
  GetEntryDraftInput,
  ListEntriesInput,
  RenameEntryInput,
  SaveEntryDraftInput,
} from "../../../contracts/entry";
import { RateLimitManager } from "../../../services/rate-limit/manager";
import {
  ToolingPrincipalAuthenticator,
  type ToolingPrincipal,
} from "../../../services/tooling/principal-authenticator";
import { resolveAuthoringMutations } from "../../../lib/authoring/mutations";
import { AuthoringSchemaRepository } from "../../../services/authoring/schema/repository";
import { AuthoringPresentationRepository } from "../../../services/authoring/presentation-repository";
import {
  AuthoringContentRepository,
  authoringEntrySummary,
} from "../../../services/authoring/content-repository";
import { EntryRepository } from "../../../services/entry/repository";
import { PublicationRepository } from "../../../services/publication/repository";

const bearerPattern = /^Bearer ([^\s,]+)$/u;

function validationFailure(path: string, code: string, message: string) {
  return ValidationFailure.make({
    details: [ApiErrorDetail.make({ path, code, message })],
  });
}

function decodeInput<A, I>(schema: Schema.Schema<A, I, never>, value: unknown, path: string) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(() =>
      validationFailure(
        path,
        "authoring_input_invalid",
        "Use a valid bounded Authoring request body and route scope.",
      ),
    ),
    Effect.withSpan("authoring.public.input.decode"),
  );
}

function countBucket(count: number): "0" | "1-10" | "11-50" | "51-100" | "101-500" {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 100) return "51-100";
  return "101-500";
}

function annotateAuthoringAuthority(
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  attributes: Readonly<Record<string, string>> = {},
) {
  return Effect.annotateCurrentSpan({
    "authoring.actor_kind": principal.kind,
    "authoring.project_id": project.projectId,
    "authoring.environment_id": project.environmentId,
    ...attributes,
  });
}

const translateAuthoringMutations = Effect.fn("authoring.public.mutation.translate")(function* (
  mutations: AuthoringCreateEntryRequest["mutations"],
  fields: Parameters<typeof resolveAuthoringMutations>[1],
) {
  yield* Effect.annotateCurrentSpan({
    "authoring.mutation_count": countBucket(mutations.length),
  });
  return resolveAuthoringMutations(mutations, fields);
});

export function decodeAuthoringProjectScope(projectId: string, environmentId: string) {
  return decodeInput(AuthoringProjectScope, { projectId, environmentId }, "path");
}

export function decodeAuthoringEntryScope(collectionKey: string, locale: string) {
  return decodeInput(AuthoringEntryScope, { collectionKey, locale }, "path");
}

export function decodeAuthoringListEntriesQuery(value: unknown) {
  return decodeInput(AuthoringListEntriesQuery, value, "query");
}

export function decodeAuthoringCreateEntryRequest(body: unknown) {
  return decodeInput(AuthoringCreateEntryRequest, body, "body");
}

export function decodeAuthoringRenameEntryRequest(body: unknown) {
  return decodeInput(AuthoringRenameEntryRequest, body, "body");
}

export function decodeAuthoringSaveEntryDraftRequest(body: unknown) {
  return decodeInput(AuthoringSaveEntryDraftRequest, body, "body");
}

export function decodeAuthoringValidatePublicationRequest(body: unknown) {
  return decodeInput(AuthoringValidatePublicationRequest, body, "body");
}

export function decodeAuthoringPublishEntryRequest(body: unknown) {
  return decodeInput(AuthoringPublishEntryRequest, body, "body");
}

export function decodeAuthoringUnpublishEntryRequest(body: unknown) {
  return decodeInput(AuthoringUnpublishEntryRequest, body, "body");
}

export function decodeAuthoringSchemaPlanRequest(body: unknown) {
  return decodeInput(AuthoringSchemaPlanRequest, body, "body");
}

export function decodeAuthoringPublishPresentationRequest(body: unknown) {
  return decodeInput(AuthoringPublishPresentationRequest, body, "body");
}

export function decodeAuthoringSchemaApplyRequest(body: unknown) {
  return decodeInput(AuthoringSchemaApplyRequest, body, "body");
}

export interface AuthoringBearerRequirement {
  readonly oauthScope: CliApiOAuthScope;
  readonly managementScopes: ReadonlyArray<CredentialScope>;
}

export const authoringSchemaExportBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_READ_SCOPE,
  managementScopes: ["schema.read"],
};

export const authoringSchemaPlanBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_SCHEMA_PUSH_SCOPE,
  managementScopes: ["schema.read", "schema.write", "schema.publish"],
};

export const authoringSchemaApplyBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_SCHEMA_PUSH_SCOPE,
  managementScopes: ["schema.read", "schema.write", "schema.publish"],
};

export const authoringPresentationPublishBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_SCHEMA_PUSH_SCOPE,
  managementScopes: ["schema.read", "schema.write", "schema.publish"],
};

export const authoringContentReadBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_READ_SCOPE,
  managementScopes: ["content.read"],
};

export const authoringDraftWriteBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_DRAFT_WRITE_SCOPE,
  managementScopes: ["content.write"],
};

export const authoringContentPublishBearerRequirement: AuthoringBearerRequirement = {
  oauthScope: AUTHORING_CONTENT_PUBLISH_SCOPE,
  managementScopes: ["content.publish"],
};

export const authenticateAuthoringRequest = Effect.fn("authoring.public.authenticate")(function* (
  authorization: string | null,
  source: string,
  requirement: AuthoringBearerRequirement,
) {
  if (authorization === null) return yield* UnauthorizedFailure.make();
  const token = bearerPattern.exec(authorization)?.[1];
  if (token === undefined) return yield* UnauthorizedFailure.make();
  return yield* (yield* ToolingPrincipalAuthenticator).authenticate({
    token,
    source,
    oauthScope: requirement.oauthScope,
    managementScopes: requirement.managementScopes,
  });
});

export function authoringPrincipalActor(principal: ToolingPrincipal): CmsActor {
  return principal.kind === "oauth_user"
    ? { kind: "user", id: AuthUserId.make(principal.userId) }
    : { kind: "credential", id: principal.credential.credentialId };
}

function authoringPrincipalKey(principal: ToolingPrincipal): string {
  return principal.kind === "oauth_user"
    ? `oauth:${principal.clientId}:${principal.userId}`
    : `credential:${principal.credential.credentialId}`;
}

export function authoringSchemaRequestCost(bodyBytes: number, operation: "plan" | "apply"): number {
  const byteUnits = Math.ceil(Math.max(0, bodyBytes) / 65_536);
  return Math.min(100, Math.max(1, 1 + byteUnits) * (operation === "apply" ? 2 : 1));
}

export const evaluateAuthoringGlobalRateLimit = Effect.fn("authoring.public.rate_limit.global")(
  function* (cost: number) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: "authoring.global",
      identity: "installation",
      cost: RateLimitCost.make(cost),
    });
  },
);

export const evaluateAuthoringPrincipalRateLimit = Effect.fn(
  "authoring.public.rate_limit.principal",
)(function* (principal: ToolingPrincipal, cost: number) {
  return yield* (yield* RateLimitManager).evaluate({
    policy: principal.kind === "oauth_user" ? "authoring.user" : "authoring.credential",
    identity: authoringPrincipalKey(principal),
    cost: RateLimitCost.make(cost),
  });
});

export const getAuthoringPresentation = Effect.fn("authoring.public.presentation.get")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  collectionKey: string,
) {
  yield* annotateAuthoringAuthority(principal, project);
  const decodedCollectionKey = yield* decodeInput(
    AuthoringEntryScope.fields.collectionKey,
    collectionKey,
    "path",
  );
  return yield* (yield* AuthoringPresentationRepository).get(
    authoringPrincipalActor(principal),
    project,
    decodedCollectionKey,
  );
});

export const publishAuthoringPresentation = Effect.fn("authoring.public.presentation.publish")(
  function* (
    principal: ToolingPrincipal,
    project: AuthoringProjectScope,
    collectionKey: string,
    request: AuthoringPublishPresentationRequestType,
    requestId: string,
  ) {
    yield* annotateAuthoringAuthority(principal, project);
    const decodedCollectionKey = yield* decodeInput(
      AuthoringEntryScope.fields.collectionKey,
      collectionKey,
      "path",
    );
    return yield* (yield* AuthoringPresentationRepository).publish(
      authoringPrincipalActor(principal),
      project,
      decodedCollectionKey,
      request,
      new Date(yield* Clock.currentTimeMillis),
      requestId,
    );
  },
);

export const listAuthoringEntries = Effect.fn("authoring.public.entry.list")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  query: AuthoringListEntriesQuery,
) {
  yield* annotateAuthoringAuthority(principal, project, {
    "authoring.page_limit": countBucket(query.limit),
  });
  const actor = authoringPrincipalActor(principal);
  const content = yield* AuthoringContentRepository;
  const collectionId = yield* content.resolveCollection(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
    action: "content.read",
  });
  const page = yield* (yield* EntryRepository).listEntries(
    actor,
    ListEntriesInput.make({
      ...project,
      collectionId,
      locale: scope.locale,
      cursor: query.cursor,
      limit: query.limit,
    }),
  );
  return AuthoringEntryPage.make({
    items: page.items.map(({ entry }) => authoringEntrySummary(entry)),
    nextCursor: page.nextCursor,
  });
});

export const getAuthoringGeneratedForm = Effect.fn("authoring.public.form.get")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  collectionKey: string,
) {
  yield* annotateAuthoringAuthority(principal, project);
  const scope = yield* decodeInput(AuthoringEntryScope.fields.collectionKey, collectionKey, "path");
  return yield* (yield* AuthoringContentRepository).getPublishedForm(
    authoringPrincipalActor(principal),
    { ...project, collectionKey: scope },
  );
});

export const getAuthoringEntryDraft = Effect.fn("authoring.public.entry.get")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  entryId: string,
) {
  yield* annotateAuthoringAuthority(principal, project, { "authoring.entry_id": entryId });
  const actor = authoringPrincipalActor(principal);
  const content = yield* AuthoringContentRepository;
  const collectionId = yield* content.resolveCollection(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
    action: "content.read",
  });
  const input = yield* decodeInput(
    GetEntryDraftInput,
    { ...project, collectionId, locale: scope.locale, entryId },
    "path",
  );
  const draft = yield* (yield* EntryRepository).getDraft(actor, input);
  return yield* content.projectDraft(draft);
});

export const createAuthoringEntry = Effect.fn("authoring.public.entry.create")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  request: AuthoringCreateEntryRequest,
  requestId: string,
) {
  yield* annotateAuthoringAuthority(principal, project, {
    "authoring.mutation_count": countBucket(request.mutations.length),
  });
  const actor = authoringPrincipalActor(principal);
  const content = yield* AuthoringContentRepository;
  const authority = yield* content.resolveMutationAuthority(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
  });
  if (
    authority.revisionId !== request.schemaRevisionId ||
    authority.contractHash !== request.contractHash
  )
    return yield* AuthoringStaleSchemaFailure.make();
  const resolved = yield* translateAuthoringMutations(request.mutations, authority.fields);
  if (!resolved.valid)
    return yield* ValidationFailure.make({
      details: resolved.issues.map((issue) =>
        ApiErrorDetail.make({
          path: issue.path,
          code: issue.code,
          message: "The mutation is unavailable under the current published field authority.",
        }),
      ),
    });
  const input = yield* decodeInput(
    CreateEntryWithDraftInput,
    {
      ...project,
      collectionId: authority.collectionId,
      locale: scope.locale,
      displayName: request.displayName,
      schemaRevisionId: request.schemaRevisionId,
      contractHash: request.contractHash,
      commandId: request.commandId,
      sharedMutations: resolved.mutations.filter(
        (_, index) => request.mutations[index]?.scope === "shared",
      ),
      localizedMutations: resolved.mutations.filter(
        (_, index) => request.mutations[index]?.scope === "localized",
      ),
    },
    "body",
  );
  const created = yield* (yield* EntryRepository)
    .createEntryWithDraft(actor, input, new Date(yield* Clock.currentTimeMillis), requestId)
    .pipe(
      Effect.mapError((error) => {
        if (error._tag === "ConflictFailure") return AuthoringStaleSchemaFailure.make();
        if (error._tag === "EntryCommandConflictFailure")
          return AuthoringCommandConflictFailure.make();
        return error;
      }),
    );
  return AuthoringCreateEntryResult.make({
    entry: authoringEntrySummary(created.entry),
    commandId: created.commandId,
    sharedVersion: created.sharedVersion,
    sharedRevisionId: created.sharedRevisionId,
    localizedVersion: created.localizedVersion,
    localizedRevisionId: created.localizedRevisionId,
    validation: AuthoringEntryValidation.make({
      valid: created.validation.valid,
      capped: created.validation.capped,
      issues: created.validation.issues.map((issue) =>
        AuthoringEntryValidationIssue.make({
          path: issue.path,
          scope: issue.scope,
          locale: issue.locale,
          code: issue.code,
          message: issue.message,
        }),
      ),
    }),
  });
});

export const renameAuthoringEntry = Effect.fn("authoring.public.entry.rename")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  entryId: string,
  request: AuthoringRenameEntryRequest,
  requestId: string,
) {
  yield* annotateAuthoringAuthority(principal, project, { "authoring.entry_id": entryId });
  const actor = authoringPrincipalActor(principal);
  const content = yield* AuthoringContentRepository;
  const collectionId = yield* content.resolveCollection(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
    action: "content.write",
  });
  const input = yield* decodeInput(
    RenameEntryInput,
    {
      ...project,
      collectionId,
      locale: scope.locale,
      entryId,
      displayName: request.displayName,
      expectedNameVersion: request.expectedNameVersion,
    },
    "body",
  );
  const renamed = yield* (yield* EntryRepository)
    .renameEntry(actor, input, new Date(yield* Clock.currentTimeMillis), requestId)
    .pipe(
      Effect.mapError((error) =>
        error._tag === "VersionConflictFailure"
          ? AuthoringDraftConflictFailure.make({
              details: [
                ApiErrorDetail.make({
                  path: "expectedNameVersion",
                  code: "entry_name_version_conflict",
                  message: "The entry name changed since it was loaded.",
                }),
              ],
            })
          : error,
      ),
    );
  return authoringEntrySummary(renamed);
});

export const saveAuthoringEntryDraft = Effect.fn("authoring.public.entry.save")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  entryId: string,
  request: AuthoringSaveEntryDraftRequest,
  requestId: string,
) {
  yield* annotateAuthoringAuthority(principal, project, {
    "authoring.entry_id": entryId,
    "authoring.mutation_count": countBucket(request.mutations.length),
  });
  const actor = authoringPrincipalActor(principal);
  const content = yield* AuthoringContentRepository;
  const authority = yield* content.resolveMutationAuthority(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
  });
  if (
    authority.revisionId !== request.schemaRevisionId ||
    authority.contractHash !== request.contractHash
  )
    return yield* AuthoringStaleSchemaFailure.make();
  const resolved = yield* translateAuthoringMutations(request.mutations, authority.fields);
  if (!resolved.valid)
    return yield* ValidationFailure.make({
      details: resolved.issues.map((issue) =>
        ApiErrorDetail.make({
          path: issue.path,
          code: issue.code,
          message: "The mutation is unavailable under the current published field authority.",
        }),
      ),
    });
  const input = yield* decodeInput(
    SaveEntryDraftInput,
    {
      ...project,
      collectionId: authority.collectionId,
      locale: scope.locale,
      entryId,
      schemaRevisionId: request.schemaRevisionId,
      contractHash: request.contractHash,
      commandId: request.commandId,
      expectedSharedVersion: request.expectedSharedVersion,
      expectedLocalizedVersion: request.expectedLocalizedVersion,
      sharedMutations: resolved.mutations.filter(
        (_, index) => request.mutations[index]?.scope === "shared",
      ),
      localizedMutations: resolved.mutations.filter(
        (_, index) => request.mutations[index]?.scope === "localized",
      ),
    },
    "body",
  );
  const saved = yield* (yield* EntryRepository)
    .saveDraft(actor, input, new Date(yield* Clock.currentTimeMillis), requestId)
    .pipe(
      Effect.mapError((error) => {
        if (error._tag === "ConflictFailure") return AuthoringStaleSchemaFailure.make();
        if (error._tag === "EntryCommandConflictFailure")
          return AuthoringCommandConflictFailure.make();
        if (error._tag === "EntryDraftConflictFailure")
          return AuthoringDraftConflictFailure.make({ details: error.details });
        return error;
      }),
    );
  return AuthoringSaveEntryDraftResult.make({
    entryId: saved.entryId,
    commandId: saved.commandId,
    sharedChanged: saved.sharedChanged,
    sharedVersion: saved.sharedVersion,
    sharedRevisionId: saved.sharedRevisionId,
    localizedChanged: saved.localizedChanged,
    localizedVersion: saved.localizedVersion,
    localizedRevisionId: saved.localizedRevisionId,
    validation: AuthoringEntryValidation.make({
      valid: saved.validation.valid,
      capped: saved.validation.capped,
      issues: saved.validation.issues.map((issue) =>
        AuthoringEntryValidationIssue.make({
          path: issue.path,
          scope: issue.scope,
          locale: issue.locale,
          code: issue.code,
          message: issue.message,
        }),
      ),
    }),
  });
});

function authoringPublicationSummary(summary: EntryPublicationSummary) {
  return AuthoringPublicationSummary.make({
    id: summary.id,
    entryId: summary.entryId,
    locale: summary.locale,
    sequence: summary.sequence,
    schemaRevisionId: summary.schemaRevisionId,
    contractHash: summary.contractHash,
    sharedRevisionId: summary.sharedRevisionId,
    sharedVersion: summary.sharedVersion,
    localizedRevisionId: summary.localizedRevisionId,
    localizedVersion: summary.localizedVersion,
    contentHash: summary.contentHash,
    authorityHash: summary.authorityHash,
    documentHash: summary.documentHash,
    size: summary.size,
    publishedAt: summary.publishedAt,
    current: summary.current,
  });
}

function authoringPublicationStatus(status: EntryPublicationStatus) {
  return AuthoringPublicationStatus.make({
    entryId: status.entryId,
    locale: status.locale,
    state: status.state,
    stateVersion: status.stateVersion,
    currentPublication:
      status.currentPublication === null
        ? null
        : authoringPublicationSummary(status.currentPublication),
    currentSchemaRevisionId: status.currentSchemaRevisionId,
    currentContractHash: status.currentContractHash,
    currentSharedRevisionId: status.currentSharedRevisionId,
    currentSharedVersion: status.currentSharedVersion,
    currentLocalizedRevisionId: status.currentLocalizedRevisionId,
    currentLocalizedVersion: status.currentLocalizedVersion,
    sharedChanged: status.sharedChanged,
    localizedChanged: status.localizedChanged,
    schemaChanged: status.schemaChanged,
    changedSincePublication: status.changedSincePublication,
  });
}

function authoringPublicationPlan(plan: EntryPublicationPlan) {
  return AuthoringPublicationPlan.make({
    entryId: plan.entryId,
    locale: plan.locale,
    stateVersion: plan.stateVersion,
    currentPublicationId: plan.currentPublicationId,
    schemaRevisionId: plan.schemaRevisionId,
    contractHash: plan.contractHash,
    sharedRevisionId: plan.sharedRevisionId,
    sharedVersion: plan.sharedVersion,
    localizedRevisionId: plan.localizedRevisionId,
    localizedVersion: plan.localizedVersion,
    valid: plan.valid,
    issues: plan.issues.map((issue) => ({
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })),
    capped: plan.capped,
    contentHash: plan.contentHash,
    authorityHash: plan.authorityHash,
    size: plan.size,
    referencesWouldRefresh: plan.referencesWouldRefresh,
    wouldCreatePublication: plan.wouldCreatePublication,
  });
}

const resolvePublicationScope = Effect.fn("authoring.public.publication.scope")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  entryId: string,
  action: "content.read" | "content.publish",
) {
  yield* annotateAuthoringAuthority(principal, project, { "authoring.entry_id": entryId });
  const actor = authoringPrincipalActor(principal);
  const collectionId = yield* (yield* AuthoringContentRepository).resolveCollection(actor, {
    ...project,
    collectionKey: scope.collectionKey,
    locale: scope.locale,
    action,
  });
  const input = yield* decodeInput(
    GetEntryPublicationStatusInput,
    { ...project, collectionId, entryId, locale: scope.locale },
    "path",
  );
  return { actor, collectionId, input };
});

export const getAuthoringPublicationStatus = Effect.fn("authoring.public.publication.status")(
  function* (
    principal: ToolingPrincipal,
    project: AuthoringProjectScope,
    scope: AuthoringEntryScope,
    entryId: string,
  ) {
    const resolved = yield* resolvePublicationScope(
      principal,
      project,
      scope,
      entryId,
      "content.read",
    );
    const status = yield* (yield* PublicationRepository).getStatus(resolved.actor, resolved.input);
    return authoringPublicationStatus(status);
  },
);

export const validateAuthoringPublication = Effect.fn("authoring.public.publication.validate")(
  function* (
    principal: ToolingPrincipal,
    project: AuthoringProjectScope,
    scope: AuthoringEntryScope,
    entryId: string,
  ) {
    const resolved = yield* resolvePublicationScope(
      principal,
      project,
      scope,
      entryId,
      "content.publish",
    );
    const input = ValidateEntryPublicationInput.make({ ...resolved.input });
    const plan = yield* (yield* PublicationRepository).validate(
      resolved.actor,
      input,
      new Date(yield* Clock.currentTimeMillis),
    );
    return authoringPublicationPlan(plan);
  },
);

export const publishAuthoringEntry = Effect.fn("authoring.public.publication.publish")(function* (
  principal: ToolingPrincipal,
  project: AuthoringProjectScope,
  scope: AuthoringEntryScope,
  entryId: string,
  request: AuthoringPublishEntryRequest,
  requestId: string,
) {
  const resolved = yield* resolvePublicationScope(
    principal,
    project,
    scope,
    entryId,
    "content.publish",
  );
  const input = yield* decodeInput(PublishEntryInput, { ...resolved.input, ...request }, "body");
  const result = yield* (yield* PublicationRepository)
    .publish(resolved.actor, input, new Date(yield* Clock.currentTimeMillis), requestId)
    .pipe(
      Effect.mapError((error) => {
        if (error._tag === "EntryCommandConflictFailure")
          return AuthoringCommandConflictFailure.make();
        if (error._tag === "EntryPublicationConflictFailure")
          return AuthoringPublicationConflictFailure.make({ details: error.details });
        if (error._tag === "EntryPublicationInvalidFailure")
          return AuthoringPublicationInvalidFailure.make({
            details: error.issues.map((issue) =>
              ApiErrorDetail.make({ path: issue.path, code: issue.code, message: issue.message }),
            ),
          });
        return error;
      }),
    );
  return AuthoringPublishEntryResult.make({
    entryId: result.entryId,
    locale: result.locale,
    commandId: result.commandId,
    stateVersion: result.stateVersion,
    resultKind: result.resultKind,
    publication: authoringPublicationSummary(result.publication),
  });
});

export const unpublishAuthoringEntry = Effect.fn("authoring.public.publication.unpublish")(
  function* (
    principal: ToolingPrincipal,
    project: AuthoringProjectScope,
    scope: AuthoringEntryScope,
    entryId: string,
    request: AuthoringUnpublishEntryRequest,
    requestId: string,
  ) {
    const resolved = yield* resolvePublicationScope(
      principal,
      project,
      scope,
      entryId,
      "content.publish",
    );
    const input = yield* decodeInput(
      UnpublishEntryInput,
      { ...resolved.input, ...request },
      "body",
    );
    const result = yield* (yield* PublicationRepository)
      .unpublish(resolved.actor, input, new Date(yield* Clock.currentTimeMillis), requestId)
      .pipe(
        Effect.mapError((error) => {
          if (error._tag === "EntryCommandConflictFailure")
            return AuthoringCommandConflictFailure.make();
          if (error._tag === "EntryPublicationConflictFailure")
            return AuthoringPublicationConflictFailure.make({ details: error.details });
          return error;
        }),
      );
    return AuthoringUnpublishEntryResult.make({
      entryId: result.entryId,
      locale: result.locale,
      commandId: result.commandId,
      stateVersion: result.stateVersion,
      resultKind: result.resultKind,
      unpublishedPublicationId: result.unpublishedPublicationId,
      unpublishedPublicationSequence: result.unpublishedPublicationSequence,
      unpublishedAt: result.unpublishedAt,
    });
  },
);

export const exportAuthoringProjectSchema = Effect.fn("authoring.public.schema.export")(function* (
  principal: ToolingPrincipal,
  scope: AuthoringProjectScope,
) {
  yield* annotateAuthoringAuthority(principal, scope);
  return yield* (yield* AuthoringSchemaRepository).exportSchema(
    authoringPrincipalActor(principal),
    AuthoringSchemaExportInput.make({ scope }),
  );
});

export const planAuthoringProjectSchema = Effect.fn("authoring.public.schema.plan")(function* (
  principal: ToolingPrincipal,
  scope: AuthoringProjectScope,
  request: AuthoringSchemaPlanRequest,
) {
  yield* annotateAuthoringAuthority(principal, scope, {
    "authoring.collection_count": countBucket(request.project.collections.length),
  });
  return yield* (yield* AuthoringSchemaRepository).plan(
    authoringPrincipalActor(principal),
    AuthoringSchemaPlanInput.make({ scope, project: request.project }),
  );
});

function sourceIdentityDetails(
  issues: ReadonlyArray<{ readonly path: string; readonly code: string }> | undefined,
) {
  const values = issues ?? [];
  return values.slice(0, 50).map((issue) =>
    ApiErrorDetail.make({
      path: issue.path.slice(0, 256),
      code: issue.code.slice(0, 64),
      message: "The source identity conflicts with current persisted authority.",
    }),
  );
}

export const applyAuthoringProjectSchema = Effect.fn("authoring.public.schema.apply")(function* (
  principal: ToolingPrincipal,
  scope: AuthoringProjectScope,
  request: AuthoringSchemaApplyRequest,
  requestId: string,
) {
  yield* annotateAuthoringAuthority(principal, scope, {
    "authoring.collection_count": countBucket(request.project.collections.length),
    "authoring.acknowledgement_count": countBucket(request.acknowledgedChangeIds.length),
  });
  const now = new Date(yield* Clock.currentTimeMillis);
  const decision = yield* (yield* AuthoringSchemaRepository).apply(
    authoringPrincipalActor(principal),
    AuthoringSchemaApplyInput.make({ scope, ...request }),
    now,
    requestId,
  );
  switch (decision.kind) {
    case "success":
      return decision.result;
    case "command_conflict":
      return yield* AuthoringCommandConflictFailure.make();
    case "stale_schema_authority":
    case "schema_plan_mismatch":
      return yield* AuthoringStaleSchemaFailure.make();
    case "schema_acknowledgement_mismatch":
      return yield* AuthoringRiskyAcknowledgementRequiredFailure.make();
    case "schema_plan_invalid":
      return yield* ValidationFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "body.project",
            code: "authoring_schema_plan_invalid",
            message: "The complete project schema is invalid.",
          }),
        ],
      });
    case "source_identity_conflict": {
      const details = sourceIdentityDetails(decision.issues);
      return yield* AuthoringSourceIdentityConflictFailure.make({
        details:
          details.length > 0
            ? details
            : [
                ApiErrorDetail.make({
                  path: "body.project",
                  code: "source_identity_conflict",
                  message: "The source identity conflicts with current persisted authority.",
                }),
              ],
      });
    }
    case "allocated_candidate_mismatch":
      return yield* Effect.die(new Error("Allocated Authoring candidate parity failed."));
  }
});
