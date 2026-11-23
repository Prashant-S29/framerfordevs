import { Effect, Schema } from "effect";

import {
  CompareEntryRevisionsInput,
  EntryId,
  EntryRevisionId,
  GetEntryRevisionInput,
  ListEntryRevisionsInput,
  RestoreEntryRevisionInput,
  type EntryValidation,
  EntryValidationIssue,
} from "../../contracts/entry";
import { AuthUserId, Cursor, PageLimit } from "../../contracts/platform";
import {
  GetEntryPublicationStatusInput,
  ListEntryPublicationsInput,
  PublishEntryInput,
  UnpublishEntryInput,
  ValidateEntryPublicationInput,
} from "../../contracts/publication";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  type ApplicationError,
  AuthoringStaleSchemaFailure,
  ForbiddenFailure,
  NotFoundFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import { AuthoringProjectScope } from "../../contracts/authoring";
import { GetCollectionInput } from "../../contracts/schema";
import { StudioBootstrapScope } from "../../contracts/studio";
import {
  StudioCommandConflictFailure,
  StudioContentCursor as StudioContentCursorSchema,
  StudioContentCursorInvalidFailure,
  StudioCreateEntryRequest,
  StudioCreateEntryResult,
  type StudioContentCursor,
  type StudioContentPageLimit,
  StudioContentScope,
  StudioCollectionLocaleScope,
  StudioCollectionScope,
  StudioPublishPresentationRequest,
  StudioDraftVersionConflictFailure,
  type StudioCollectionLocaleScope as StudioCollectionLocaleScopeType,
  StudioEntryDraftProjection,
  StudioEntryPage,
  StudioEntrySummary,
  StudioEntryValidation,
  StudioEntryWorkspace,
  StudioListEntriesQuery,
  StudioListPublicationsQuery,
  StudioListRevisionsQuery,
  StudioMutationReceipt,
  StudioNameVersionConflictFailure,
  StudioNewEntryWorkspace,
  StudioPublicationInvalidFailure,
  StudioPublicationPage,
  StudioPublicationStateConflictFailure,
  StudioPublishEntryRequest,
  StudioPublishResult,
  StudioRenameEntryRequest,
  StudioResolveEntriesRequest,
  StudioResolvedEntryLabels,
  StudioRestoreRevisionRequest,
  StudioRevision,
  StudioRevisionIncompatibleFailure,
  StudioRevisionPage,
  StudioSaveEntryDraftRequest,
  StudioSearchEntriesRequest,
  StudioUnpublishEntryRequest,
  StudioUnpublishResult,
  StudioValidatePublicationRequest,
  type StudioFormProjection,
} from "../../contracts/studio-content";
import { evaluateStudioUserRateLimit } from "../studio-public";
import { projectStudioForm, projectStudioValues } from "../../lib/studio-content/form-projection";
import { studioMutationsUseProjectedAuthority } from "../../lib/studio-content/mutation-authority";
import { studioSearchAuthority } from "../../lib/studio-content/search";
import {
  projectStudioPublicationFailureDetails,
  projectStudioPublicationPlan,
  projectStudioPublicationStatus,
  projectStudioPublicationSummary,
  projectStudioRevisionComparison,
  projectStudioRevisionSummary,
} from "../../lib/studio-content/revision-projection";
import { ApplicationLogger } from "../../observability/logger";
import { EntryRepository } from "../../services/entry/repository";
import { PublicationRepository } from "../../services/publication/repository";
import { SchemaRepository } from "../../services/schema/repository";
import { AuthoringPresentationRepository } from "../../services/authoring/presentation-repository";
import type { PreviewHandoffRequest } from "../../contracts/preview-handoff";
import { issuePreviewHandoff } from "../preview-handoff";
import { StudioContentCursorSigner } from "../../services/studio-content/cursor-signer";
import {
  type StudioCollectionAuthority,
  StudioContentRepository,
} from "../../services/studio-content/repository";
import type { StudioRequestPrincipal } from "../../services/studio/principal-authenticator";
import { StudioRepository } from "../../services/studio/repository";

function invalidPath() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "path",
        code: "studio_content_path_invalid",
        message: "Use valid Studio Content scope identifiers.",
      }),
    ],
  });
}

function closedStudioValidationFailure(): ValidationFailure {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        code: "studio_values_invalid",
        message: "One or more submitted Studio values are invalid.",
      }),
    ],
  });
}

export function adaptStudioCreateError(error: ApplicationError): ApplicationError {
  if (error._tag === "ValidationFailure") return closedStudioValidationFailure();
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
}

export function adaptStudioRenameError(error: ApplicationError): ApplicationError {
  if (error._tag === "ValidationFailure") return closedStudioValidationFailure();
  return error._tag === "VersionConflictFailure" ? StudioNameVersionConflictFailure.make() : error;
}

export function adaptStudioSaveError(error: ApplicationError): ApplicationError {
  if (error._tag === "ValidationFailure") return closedStudioValidationFailure();
  if (error._tag === "EntryDraftConflictFailure") {
    return StudioDraftVersionConflictFailure.make({ details: error.details });
  }
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
}

export function adaptStudioRestoreError(error: ApplicationError): ApplicationError {
  if (error._tag === "ValidationFailure") return closedStudioValidationFailure();
  if (error._tag === "ConflictFailure") return AuthoringStaleSchemaFailure.make();
  if (error._tag === "EntryRevisionIncompatibleFailure")
    return StudioRevisionIncompatibleFailure.make();
  if (error._tag === "EntryDraftConflictFailure") {
    return StudioDraftVersionConflictFailure.make({ details: error.details });
  }
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
}

export function adaptStudioPublicationError(
  error: ApplicationError,
  form: StudioFormProjection,
  authority: Pick<StudioCollectionAuthority, "localeId" | "locale">,
): ApplicationError {
  if (error._tag === "EntryPublicationInvalidFailure") {
    return StudioPublicationInvalidFailure.make({
      details: projectStudioPublicationFailureDetails(error.issues, form, {
        localeId: authority.localeId,
        locale: authority.locale,
      }),
    });
  }
  if (error._tag === "EntryPublicationConflictFailure") {
    return StudioPublicationStateConflictFailure.make({
      details: error.details.slice(0, 20),
    });
  }
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
}

function adaptStudioCursorError(error: ApplicationError): ApplicationError {
  return error._tag === "ValidationFailure" &&
    error.details.some((detail) => detail.path === "cursor")
    ? StudioContentCursorInvalidFailure.make()
    : error;
}

function domainCursor(cursor: StudioContentCursor | null) {
  if (cursor === null) return Effect.succeed(null);
  return Schema.decodeUnknownEffect(Cursor, { onExcessProperty: "error" })(cursor).pipe(
    Effect.mapError(() => StudioContentCursorInvalidFailure.make()),
  );
}

function studioCursor(cursor: Cursor | null): StudioContentCursor | null {
  return cursor === null
    ? null
    : Schema.decodeUnknownSync(StudioContentCursorSchema, { onExcessProperty: "error" })(cursor);
}

function unavailableMutation() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "body.mutations",
        code: "entry_path_unavailable",
        message: "One or more mutation paths are unavailable for this Studio form.",
      }),
    ],
  });
}

export function decodeStudioContentScope(projectId: string, environmentId: string) {
  return Schema.decodeUnknownEffect(StudioContentScope, { onExcessProperty: "error" })({
    projectId,
    environmentId,
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioCollectionScope(
  projectId: string,
  environmentId: string,
  collectionId: string,
) {
  return Schema.decodeUnknownEffect(StudioCollectionScope, { onExcessProperty: "error" })({
    projectId,
    environmentId,
    collectionId,
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioPublishPresentationRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioPublishPresentationRequest, {
    onExcessProperty: "error",
  })(value).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioCollectionLocaleScope(
  projectId: string,
  environmentId: string,
  collectionId: string,
  locale: string,
) {
  return Schema.decodeUnknownEffect(StudioCollectionLocaleScope, { onExcessProperty: "error" })({
    projectId,
    environmentId,
    collectionId,
    locale,
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioListEntriesQuery(value: unknown) {
  return Schema.decodeUnknownEffect(StudioListEntriesQuery, { onExcessProperty: "error" })(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioSearchEntriesRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioSearchEntriesRequest, { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioResolveEntriesRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioResolveEntriesRequest, { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioCreateEntryRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioCreateEntryRequest, { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioRenameEntryRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioRenameEntryRequest, { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioListRevisionsQuery(value: unknown) {
  return Schema.decodeUnknownEffect(StudioListRevisionsQuery, { onExcessProperty: "error" })(
    value,
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioListPublicationsQuery(value: unknown) {
  return Schema.decodeUnknownEffect(StudioListPublicationsQuery, { onExcessProperty: "error" })(
    value,
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioRevisionId(value: string) {
  return Schema.decodeUnknownEffect(EntryRevisionId, { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(() => invalidPath()),
  );
}

export function decodeStudioRestoreRevisionRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioRestoreRevisionRequest, { onExcessProperty: "error" })(
    value,
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioValidatePublicationRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioValidatePublicationRequest, {
    onExcessProperty: "error",
  })(value).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioPublishEntryRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioPublishEntryRequest, { onExcessProperty: "error" })(
    value,
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioUnpublishEntryRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioUnpublishEntryRequest, { onExcessProperty: "error" })(
    value,
  ).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioSaveEntryDraftRequest(value: unknown) {
  return Schema.decodeUnknownEffect(StudioSaveEntryDraftRequest, { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  ).pipe(Effect.mapError(() => invalidPath()));
}

export const revalidateStudioContentPrincipal = Effect.fn(
  "studio_content.public.principal.revalidate",
)(function* (principal: StudioRequestPrincipal, scope: StudioContentScope) {
  yield* (yield* StudioRepository).getBootstrap({
    principal,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
});

export const studioNestedCollectionOperations = [
  "browse",
  "search",
  "resolve",
  "new_workspace",
  "entry_workspace",
  "create",
  "rename",
  "save",
  "revisions",
  "revision",
  "compare",
  "restore",
  "publication",
  "publications",
  "validate",
  "publish",
  "unpublish",
  "preview",
] as const;
export type StudioNestedCollectionOperation = (typeof studioNestedCollectionOperations)[number];

const studioOperationCost = {
  browse: 1,
  search: 1,
  resolve: 1,
  new_workspace: 2,
  entry_workspace: 3,
  create: 5,
  rename: 5,
  save: 5,
  revisions: 1,
  revision: 1,
  compare: 2,
  restore: 5,
  publication: 1,
  publications: 1,
  validate: 3,
  publish: 5,
  unpublish: 5,
  preview: 2,
} as const satisfies Readonly<Record<StudioNestedCollectionOperation, number>>;

function decodeActorId(principal: StudioRequestPrincipal) {
  return Schema.decodeUnknownEffect(AuthUserId, { onExcessProperty: "error" })(
    principal.userId,
  ).pipe(Effect.mapError(() => invalidPath()));
}

const authorizeCurrentStudioCollection = Effect.fn(
  "studio_content.public.collection.authorize_current",
)(function* (actorId: typeof AuthUserId.Type, scope: StudioCollectionLocaleScopeType, now: Date) {
  const logger = yield* ApplicationLogger;
  return yield* (yield* StudioContentRepository).authorizeCollection(actorId, scope, now).pipe(
    Effect.tapError((error) =>
      error._tag === "StudioCollectionConfigurationInvalidFailure" &&
      error.reason === "projection_invalid"
        ? logger.error("Studio collection projection invariant failed.", {
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            collectionId: scope.collectionId,
            reason: error.reason,
          })
        : Effect.void,
    ),
  );
});

export const authorizeStudioCollectionOperation = Effect.fn(
  "studio_content.public.collection.authorize",
)(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  operation: StudioNestedCollectionOperation,
  now: Date,
) {
  yield* evaluateStudioUserRateLimit(principal, studioOperationCost[operation]);
  yield* Effect.annotateCurrentSpan({
    "studio_content.operation": operation,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
  });
  yield* revalidateStudioContentPrincipal(principal, scope);
  const actorId = yield* decodeActorId(principal);
  return yield* authorizeCurrentStudioCollection(actorId, scope, now);
});

const listStudioEntries = Effect.fn("studio_content.public.entries.list")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  input: {
    readonly cursor: StudioContentCursor | null;
    readonly limit: StudioContentPageLimit;
    readonly query: string | null;
  },
  operation: "browse" | "search",
  now: Date,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, operation, now);
  const search = input.query === null ? null : studioSearchAuthority(input.query);
  const cursorAuthority = {
    mode: operation,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
    locale: scope.locale,
    schemaRevisionId: authority.schemaRevisionId,
    queryDigest: search?.queryDigest ?? null,
  } as const;
  const cursorOrder =
    input.cursor === null
      ? { browseOrder: null, searchOrder: null }
      : yield* (yield* StudioContentCursorSigner).verify(input.cursor, cursorAuthority);
  const actorId = yield* decodeActorId(principal);
  const result = yield* (yield* StudioContentRepository).listEntries(
    actorId,
    {
      scope,
      expectedSchemaRevisionId: authority.schemaRevisionId,
      limit: input.limit,
      search,
      browseOrder: cursorOrder.browseOrder,
      searchOrder: cursorOrder.searchOrder,
    },
    now,
  );
  const nextCursor =
    result.page.hasMore && (result.finalBrowseOrder !== null || result.finalSearchOrder !== null)
      ? yield* (yield* StudioContentCursorSigner).sign({
          ...cursorAuthority,
          browseOrder: result.finalBrowseOrder,
          searchOrder: result.finalSearchOrder,
        })
      : null;
  return Schema.decodeUnknownSync(StudioEntryPage, { onExcessProperty: "error" })({
    ...result.page,
    nextCursor,
  });
});

export const browseStudioEntries = Effect.fn("studio_content.public.entries.browse")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  query: StudioListEntriesQuery,
  now: Date,
) {
  return yield* listStudioEntries(
    principal,
    scope,
    { cursor: query.cursor, limit: query.limit, query: null },
    "browse",
    now,
  );
});

export const searchStudioEntries = Effect.fn("studio_content.public.entries.search")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  request: StudioSearchEntriesRequest,
  now: Date,
) {
  return yield* listStudioEntries(
    principal,
    scope,
    { cursor: request.cursor, limit: request.limit, query: request.query },
    "search",
    now,
  );
});

export const resolveStudioEntryLabels = Effect.fn("studio_content.public.entries.resolve")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    request: StudioResolveEntriesRequest,
    now: Date,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(principal, scope, "resolve", now);
    const actorId = yield* decodeActorId(principal);
    const items = yield* (yield* StudioContentRepository).resolveEntryLabels(
      actorId,
      {
        scope,
        expectedSchemaRevisionId: authority.schemaRevisionId,
        entryIds: request.entryIds,
      },
      now,
    );
    return StudioResolvedEntryLabels.make({ items });
  },
);

export function projectStudioValidation(
  validation: EntryValidation,
  form: ReturnType<typeof projectStudioForm>,
): StudioEntryValidation {
  const visibleFieldIds = new Set<string>();
  const visit = (fields: typeof form.fields): void => {
    for (const field of fields) {
      visibleFieldIds.add(field.id);
      visit(field.children);
    }
  };
  visit(form.fields);
  const visibleIssues = validation.issues.filter((issue) => visibleFieldIds.has(issue.fieldId));
  const issues = visibleIssues.map((issue) =>
    EntryValidationIssue.make({
      fieldId: issue.fieldId,
      path: `field/${issue.fieldId}`,
      scope: issue.scope,
      localeId: issue.localeId,
      locale: issue.locale,
      code: issue.code,
      message: "This field value is invalid.",
    }),
  );
  return StudioEntryValidation.make({
    status: validation.valid
      ? "valid"
      : issues.length === 0 || issues.length < validation.issues.length
        ? "restricted_issues"
        : "invalid",
    issues,
    capped: validation.capped,
  });
}

function studioEntrySummary(entry: {
  readonly id: string;
  readonly displayName: string | null;
  readonly nameVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}) {
  if (entry.displayName === null) return null;
  return Schema.decodeUnknownSync(StudioEntrySummary, { onExcessProperty: "error" })({
    id: entry.id,
    displayName: entry.displayName,
    nameVersion: entry.nameVersion,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

function studioCapabilities(authority: StudioCollectionAuthority) {
  return {
    canCreate: authority.canCreate,
    canRename: authority.canRename,
    canSaveLocalized: authority.canWriteLocalized,
    canSaveShared: authority.canWriteShared,
    canPublish: authority.canPublish,
    canPublishPresentation: authority.canPublishPresentation,
  };
}

export function decodeStudioEntryId(value: string) {
  return Schema.decodeUnknownEffect(EntryId, { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(() => invalidPath()),
  );
}

export const getStudioNewEntryWorkspace = Effect.fn("studio_content.public.workspace.new")(
  function* (principal: StudioRequestPrincipal, scope: StudioCollectionLocaleScopeType, now: Date) {
    let authority = yield* authorizeStudioCollectionOperation(
      principal,
      scope,
      "new_workspace",
      now,
    );
    const actorId = yield* decodeActorId(principal);
    const schemaRepository = yield* SchemaRepository;
    let form = yield* schemaRepository.getPublishedForm(actorId, {
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      collectionId: scope.collectionId,
      revisionId: authority.schemaRevisionId,
    });
    let confirmed = yield* authorizeCurrentStudioCollection(actorId, scope, now);
    if (confirmed.schemaRevisionId !== authority.schemaRevisionId) {
      authority = confirmed;
      form = yield* schemaRepository.getPublishedForm(actorId, {
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        collectionId: scope.collectionId,
        revisionId: authority.schemaRevisionId,
      });
      confirmed = yield* authorizeCurrentStudioCollection(actorId, scope, now);
      if (confirmed.schemaRevisionId !== authority.schemaRevisionId) {
        return yield* AuthoringStaleSchemaFailure.make();
      }
    }
    return Schema.decodeUnknownSync(StudioNewEntryWorkspace, { onExcessProperty: "error" })({
      localeId: authority.localeId,
      locale: authority.locale,
      form: projectStudioForm(form),
      capabilities: studioCapabilities(authority),
    });
  },
);

export const getStudioEntryWorkspace = Effect.fn("studio_content.public.workspace.entry")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    now: Date,
  ) {
    let authority = yield* authorizeStudioCollectionOperation(
      principal,
      scope,
      "entry_workspace",
      now,
    );
    const actorId = yield* decodeActorId(principal);
    const entryRepository = yield* EntryRepository;
    const schemaRepository = yield* SchemaRepository;
    let draft = yield* entryRepository.getDraft(actorId, { ...scope, entryId });
    let form = yield* schemaRepository.getPublishedForm(actorId, {
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      collectionId: scope.collectionId,
      revisionId: authority.schemaRevisionId,
    });
    let confirmed = yield* authorizeCurrentStudioCollection(actorId, scope, now);
    if (
      draft.schemaRevisionId !== authority.schemaRevisionId ||
      confirmed.schemaRevisionId !== authority.schemaRevisionId
    ) {
      authority = confirmed;
      draft = yield* entryRepository.getDraft(actorId, { ...scope, entryId });
      form = yield* schemaRepository.getPublishedForm(actorId, {
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        collectionId: scope.collectionId,
        revisionId: authority.schemaRevisionId,
      });
      confirmed = yield* authorizeCurrentStudioCollection(actorId, scope, now);
      if (
        draft.schemaRevisionId !== authority.schemaRevisionId ||
        confirmed.schemaRevisionId !== authority.schemaRevisionId
      ) {
        return yield* AuthoringStaleSchemaFailure.make();
      }
    }
    const entry = studioEntrySummary(draft.entry);
    if (entry === null) return yield* NotFoundFailure.make({ resource: "entry" });
    const projectedForm = projectStudioForm(form);
    const publication = yield* (yield* PublicationRepository).getStatus(
      actorId,
      GetEntryPublicationStatusInput.make({ ...scope, entryId }),
    );
    return Schema.decodeUnknownSync(StudioEntryWorkspace, { onExcessProperty: "error" })({
      localeId: authority.localeId,
      locale: authority.locale,
      form: projectedForm,
      capabilities: studioCapabilities(authority),
      publication: projectStudioPublicationStatus(publication, projectedForm),
      draft: StudioEntryDraftProjection.make({
        entry,
        schemaRevisionId: draft.schemaRevisionId,
        contractHash: draft.contractHash,
        sharedVersion: draft.sharedVersion,
        sharedRevisionId: draft.sharedRevisionId,
        sharedValues: projectStudioValues(draft.sharedValues, projectedForm.fields),
        localizedVersion: draft.localizedVersion,
        localizedRevisionId: draft.localizedRevisionId,
        localizedValues: projectStudioValues(draft.localizedValues, projectedForm.fields),
        validation: projectStudioValidation(draft.validation, projectedForm),
      }),
    });
  },
);

export const createStudioEntry = Effect.fn("studio_content.public.entry.create")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  request: StudioCreateEntryRequest,
  now: Date,
  requestId: string,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "create", now);
  if (!authority.canCreate || (request.sharedMutations.length > 0 && !authority.canWriteShared)) {
    return yield* ForbiddenFailure.make();
  }
  const actorId = yield* decodeActorId(principal);
  const form = yield* (yield* SchemaRepository).getPublishedForm(actorId, {
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
    revisionId: authority.schemaRevisionId,
  });
  const projectedForm = projectStudioForm(form);
  if (
    request.schemaRevisionId !== projectedForm.schemaRevisionId ||
    request.contractHash !== projectedForm.contractHash
  ) {
    return yield* AuthoringStaleSchemaFailure.make();
  }
  if (
    !studioMutationsUseProjectedAuthority(request.sharedMutations, projectedForm) ||
    !studioMutationsUseProjectedAuthority(request.localizedMutations, projectedForm)
  ) {
    return yield* unavailableMutation();
  }
  const result = yield* (yield* EntryRepository)
    .createEntryWithDraft(actorId, { ...scope, ...request }, now, requestId)
    .pipe(Effect.mapError(adaptStudioCreateError));
  const entry = studioEntrySummary(result.entry);
  if (entry === null) return yield* NotFoundFailure.make({ resource: "entry" });
  return Schema.decodeUnknownSync(StudioCreateEntryResult, { onExcessProperty: "error" })({
    entry,
    commandId: result.commandId,
    sharedVersion: result.sharedVersion,
    sharedRevisionId: result.sharedRevisionId,
    localizedVersion: result.localizedVersion,
    localizedRevisionId: result.localizedRevisionId,
    validation: projectStudioValidation(result.validation, projectedForm),
  });
});

export const renameStudioEntry = Effect.fn("studio_content.public.entry.rename")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  entryId: typeof EntryId.Type,
  request: StudioRenameEntryRequest,
  now: Date,
  requestId: string,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "rename", now);
  if (!authority.canRename) return yield* ForbiddenFailure.make();
  const actorId = yield* decodeActorId(principal);
  const result = yield* (yield* EntryRepository)
    .renameEntry(actorId, { ...scope, entryId, ...request }, now, requestId)
    .pipe(Effect.mapError(adaptStudioRenameError));
  const entry = studioEntrySummary(result);
  if (entry === null) return yield* NotFoundFailure.make({ resource: "entry" });
  return entry;
});

export const saveStudioEntryDraft = Effect.fn("studio_content.public.entry.save")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  entryId: typeof EntryId.Type,
  request: StudioSaveEntryDraftRequest,
  now: Date,
  requestId: string,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "save", now);
  if (
    !authority.canWriteLocalized ||
    (request.sharedMutations.length > 0 && !authority.canWriteShared)
  ) {
    return yield* ForbiddenFailure.make();
  }
  const actorId = yield* decodeActorId(principal);
  const form = yield* (yield* SchemaRepository).getPublishedForm(actorId, {
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
    revisionId: authority.schemaRevisionId,
  });
  const projectedForm = projectStudioForm(form);
  if (
    request.schemaRevisionId !== projectedForm.schemaRevisionId ||
    request.contractHash !== projectedForm.contractHash
  ) {
    return yield* AuthoringStaleSchemaFailure.make();
  }
  if (
    !studioMutationsUseProjectedAuthority(request.sharedMutations, projectedForm) ||
    !studioMutationsUseProjectedAuthority(request.localizedMutations, projectedForm)
  ) {
    return yield* unavailableMutation();
  }
  const result = yield* (yield* EntryRepository)
    .saveDraft(actorId, { ...scope, entryId, ...request }, now, requestId)
    .pipe(Effect.mapError(adaptStudioSaveError));
  return Schema.decodeUnknownSync(StudioMutationReceipt, { onExcessProperty: "error" })({
    entryId: result.entryId,
    commandId: result.commandId,
    sharedChanged: result.sharedChanged,
    sharedVersion: result.sharedVersion,
    sharedRevisionId: result.sharedRevisionId,
    localizedChanged: result.localizedChanged,
    localizedVersion: result.localizedVersion,
    localizedRevisionId: result.localizedRevisionId,
    validation: projectStudioValidation(result.validation, projectedForm),
  });
});

export const getStudioContentContext = Effect.fn("studio_content.public.context.get")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioContentScope,
  now: Date,
) {
  yield* evaluateStudioUserRateLimit(principal, 2);
  yield* Effect.annotateCurrentSpan({
    "studio_content.operation": "context",
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
  yield* revalidateStudioContentPrincipal(principal, scope);
  const actorId = yield* decodeActorId(principal);
  const context = yield* (yield* StudioContentRepository).getContext(actorId, scope, now);
  const logger = yield* ApplicationLogger;
  for (const notice of context.configurationNotices) {
    if (notice.reason === "projection_invalid") {
      yield* logger.error("Studio collection projection invariant failed.", {
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        collectionId: notice.collectionId,
        reason: notice.reason,
      });
    }
  }
  return context;
});

export function studioBootstrapScope(scope: StudioContentScope): StudioBootstrapScope {
  return StudioBootstrapScope.make({
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
}

const loadStudioForm = Effect.fn("studio_content.public.form.load")(function* (
  actorId: typeof AuthUserId.Type,
  scope: StudioCollectionLocaleScopeType,
  authority: StudioCollectionAuthority,
) {
  const form = yield* (yield* SchemaRepository).getPublishedForm(actorId, {
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
    revisionId: authority.schemaRevisionId,
  });
  return projectStudioForm(form);
});

export const listStudioEntryRevisions = Effect.fn("studio_content.public.revisions.list")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    query: StudioListRevisionsQuery,
    now: Date,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(principal, scope, "revisions", now);
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    const cursor = yield* domainCursor(query.cursor);
    const page = yield* (yield* EntryRepository)
      .listRevisions(
        actorId,
        ListEntryRevisionsInput.make({
          ...scope,
          entryId,
          scope: query.scope,
          cursor,
          limit: PageLimit.make(query.limit),
        }),
      )
      .pipe(Effect.mapError(adaptStudioCursorError));
    return StudioRevisionPage.make({
      items: page.items.map((item) => projectStudioRevisionSummary(item, form)),
      nextCursor: studioCursor(page.nextCursor),
    });
  },
);

export const getStudioEntryRevision = Effect.fn("studio_content.public.revisions.get")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  entryId: typeof EntryId.Type,
  revisionId: typeof EntryRevisionId.Type,
  now: Date,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "revision", now);
  const actorId = yield* decodeActorId(principal);
  const form = yield* loadStudioForm(actorId, scope, authority);
  const revision = yield* (yield* EntryRepository).getRevision(
    actorId,
    GetEntryRevisionInput.make({ ...scope, entryId, revisionId }),
  );
  return StudioRevision.make({
    revision: projectStudioRevisionSummary(revision.revision, form),
    values: projectStudioValues(revision.values, form.fields),
  });
});

export const compareStudioEntryRevisions = Effect.fn("studio_content.public.revisions.compare")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    fromRevisionId: typeof EntryRevisionId.Type,
    toRevisionId: typeof EntryRevisionId.Type,
    now: Date,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(principal, scope, "compare", now);
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    const comparison = yield* (yield* EntryRepository).compareRevisions(
      actorId,
      CompareEntryRevisionsInput.make({ ...scope, entryId, fromRevisionId, toRevisionId }),
    );
    return projectStudioRevisionComparison(comparison, form);
  },
);

export const restoreStudioEntryRevision = Effect.fn("studio_content.public.revisions.restore")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    revisionId: typeof EntryRevisionId.Type,
    request: StudioRestoreRevisionRequest,
    now: Date,
    requestId: string,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(principal, scope, "restore", now);
    if (request.scope === "shared" ? !authority.canWriteShared : !authority.canWriteLocalized) {
      return yield* ForbiddenFailure.make();
    }
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    if (
      request.schemaRevisionId !== form.schemaRevisionId ||
      request.contractHash !== form.contractHash
    ) {
      return yield* AuthoringStaleSchemaFailure.make();
    }
    const result = yield* (yield* EntryRepository)
      .restoreRevision(
        actorId,
        RestoreEntryRevisionInput.make({
          ...scope,
          entryId,
          revisionId,
          scope: request.scope,
          schemaRevisionId: request.schemaRevisionId,
          contractHash: request.contractHash,
          expectedVersion: request.expectedVersion,
          commandId: request.commandId,
        }),
        now,
        requestId,
      )
      .pipe(Effect.mapError(adaptStudioRestoreError));
    return Schema.decodeUnknownSync(StudioMutationReceipt, { onExcessProperty: "error" })({
      entryId: result.entryId,
      commandId: result.commandId,
      sharedChanged: result.sharedChanged,
      sharedVersion: result.sharedVersion,
      sharedRevisionId: result.sharedRevisionId,
      localizedChanged: result.localizedChanged,
      localizedVersion: result.localizedVersion,
      localizedRevisionId: result.localizedRevisionId,
      validation: projectStudioValidation(result.validation, form),
    });
  },
);

export const getStudioEntryPublication = Effect.fn("studio_content.public.publication.get")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    now: Date,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(
      principal,
      scope,
      "publication",
      now,
    );
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    const status = yield* (yield* PublicationRepository).getStatus(
      actorId,
      GetEntryPublicationStatusInput.make({ ...scope, entryId }),
    );
    return projectStudioPublicationStatus(status, form);
  },
);

export const listStudioEntryPublications = Effect.fn("studio_content.public.publications.list")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    query: StudioListPublicationsQuery,
    now: Date,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(
      principal,
      scope,
      "publications",
      now,
    );
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    const cursor = yield* domainCursor(query.cursor);
    const page = yield* (yield* PublicationRepository)
      .list(
        actorId,
        ListEntryPublicationsInput.make({
          ...scope,
          entryId,
          cursor,
          limit: PageLimit.make(query.limit),
        }),
      )
      .pipe(Effect.mapError(adaptStudioCursorError));
    return StudioPublicationPage.make({
      items: page.items.map((item) => projectStudioPublicationSummary(item, form)),
      nextCursor: studioCursor(page.nextCursor),
    });
  },
);

export const validateStudioEntryPublication = Effect.fn(
  "studio_content.public.publication.validate",
)(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  entryId: typeof EntryId.Type,
  _request: StudioValidatePublicationRequest,
  now: Date,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "validate", now);
  if (!authority.canPublish) return yield* ForbiddenFailure.make();
  const actorId = yield* decodeActorId(principal);
  const form = yield* loadStudioForm(actorId, scope, authority);
  const plan = yield* (yield* PublicationRepository).validate(
    actorId,
    ValidateEntryPublicationInput.make({ ...scope, entryId }),
    now,
  );
  return projectStudioPublicationPlan(plan, form);
});

export const publishStudioEntry = Effect.fn("studio_content.public.publication.publish")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionLocaleScopeType,
  entryId: typeof EntryId.Type,
  request: StudioPublishEntryRequest,
  now: Date,
  requestId: string,
) {
  const authority = yield* authorizeStudioCollectionOperation(principal, scope, "publish", now);
  if (!authority.canPublish) return yield* ForbiddenFailure.make();
  const actorId = yield* decodeActorId(principal);
  const form = yield* loadStudioForm(actorId, scope, authority);
  const result = yield* (yield* PublicationRepository)
    .publish(actorId, PublishEntryInput.make({ ...scope, entryId, ...request }), now, requestId)
    .pipe(Effect.mapError((error) => adaptStudioPublicationError(error, form, authority)));
  return StudioPublishResult.make({
    commandId: result.commandId,
    resultKind: result.resultKind,
    stateVersion: result.stateVersion,
    publication: projectStudioPublicationSummary(result.publication, form),
    delivery: result.delivery,
  });
});

export const unpublishStudioEntry = Effect.fn("studio_content.public.publication.unpublish")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    request: StudioUnpublishEntryRequest,
    now: Date,
    requestId: string,
  ) {
    const authority = yield* authorizeStudioCollectionOperation(principal, scope, "unpublish", now);
    if (!authority.canPublish) return yield* ForbiddenFailure.make();
    const actorId = yield* decodeActorId(principal);
    const form = yield* loadStudioForm(actorId, scope, authority);
    const result = yield* (yield* PublicationRepository)
      .unpublish(
        actorId,
        UnpublishEntryInput.make({ ...scope, entryId, ...request }),
        now,
        requestId,
      )
      .pipe(Effect.mapError((error) => adaptStudioPublicationError(error, form, authority)));
    return StudioUnpublishResult.make({
      commandId: result.commandId,
      resultKind: result.resultKind,
      stateVersion: result.stateVersion,
      unpublishedPublicationId: result.unpublishedPublicationId,
      unpublishedAt: result.unpublishedAt,
      delivery: result.delivery,
    });
  },
);

const resolveStudioPresentationCollection = Effect.fn(
  "studio_content.public.presentation.authorize",
)(function* (principal: StudioRequestPrincipal, scope: StudioCollectionScope, cost: number) {
  yield* evaluateStudioUserRateLimit(principal, cost);
  yield* Effect.annotateCurrentSpan({
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    collectionId: scope.collectionId,
  });
  yield* revalidateStudioContentPrincipal(principal, scope);
  const actorId = yield* decodeActorId(principal);
  const collection = yield* (yield* SchemaRepository).getCollection(
    actorId,
    GetCollectionInput.make(scope),
  );
  return {
    actor: { kind: "user" as const, id: actorId },
    project: AuthoringProjectScope.make({
      projectId: scope.projectId,
      environmentId: scope.environmentId,
    }),
    collectionKey: collection.apiKey,
  };
});

export const getStudioPresentation = Effect.fn("studio_content.public.presentation.get")(function* (
  principal: StudioRequestPrincipal,
  scope: StudioCollectionScope,
) {
  const target = yield* resolveStudioPresentationCollection(principal, scope, 1);
  return yield* (yield* AuthoringPresentationRepository).getStudio(
    target.actor,
    target.project,
    target.collectionKey,
  );
});

export const publishStudioPresentation = Effect.fn("studio_content.public.presentation.publish")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionScope,
    request: StudioPublishPresentationRequest,
    now: Date,
    requestId: string,
  ) {
    const target = yield* resolveStudioPresentationCollection(principal, scope, 5);
    return yield* (yield* AuthoringPresentationRepository).publishStudio(
      target.actor,
      target.project,
      target.collectionKey,
      request,
      now,
      requestId,
    );
  },
);

export const issueStudioPreviewHandoff = Effect.fn("studio_content.public.preview.handoff")(
  function* (
    principal: StudioRequestPrincipal,
    scope: StudioCollectionLocaleScopeType,
    entryId: typeof EntryId.Type,
    request: PreviewHandoffRequest,
    now: Date,
    requestId: string,
  ) {
    yield* authorizeStudioCollectionOperation(principal, scope, "preview", now);
    const actorId = yield* decodeActorId(principal);
    return yield* issuePreviewHandoff(
      actorId,
      { ...scope, entryId },
      request,
      principal.kind === "studio_oauth_user" ? "studio" : "local_editor",
      requestId,
    );
  },
);
