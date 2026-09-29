// Orchestrates Studio-token revalidation and bounded Studio Content operations.

import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";

import { EntryId, type EntryValidation } from "../../contracts/entry";
import { AuthUserId } from "../../contracts/platform";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  type ApplicationError,
  AuthoringStaleSchemaFailure,
  ForbiddenFailure,
  NotFoundFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import { StudioBootstrapScope } from "../../contracts/studio";
import {
  StudioCommandConflictFailure,
  StudioCreateEntryRequest,
  StudioCreateEntryResult,
  type StudioContentCursor,
  type StudioContentPageLimit,
  StudioContentScope,
  StudioCollectionLocaleScope,
  StudioDraftVersionConflictFailure,
  type StudioCollectionLocaleScope as StudioCollectionLocaleScopeType,
  StudioEntryDraftProjection,
  StudioEntryPage,
  StudioEntrySummary,
  StudioEntryValidation,
  StudioEntryWorkspace,
  StudioListEntriesQuery,
  StudioMutationReceipt,
  StudioNameVersionConflictFailure,
  StudioNewEntryWorkspace,
  StudioRenameEntryRequest,
  StudioSaveEntryDraftRequest,
  StudioSearchEntriesRequest,
} from "../../contracts/studio-content";
import { evaluateStudioUserRateLimit } from "../studio-public";
import { projectStudioForm, projectStudioValues } from "../../lib/studio-content/form-projection";
import { studioMutationsUseProjectedAuthority } from "../../lib/studio-content/mutation-authority";
import { studioSearchAuthority } from "../../lib/studio-content/search";
import { ApplicationLogger } from "../../observability/logger";
import { EntryRepository } from "../../services/entry/repository";
import { SchemaRepository } from "../../services/schema/repository";
import { StudioContentCursorSigner } from "../../services/studio-content/cursor-signer";
import { StudioContentRepository } from "../../services/studio-content/repository";
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

export function adaptStudioCreateError(error: ApplicationError): ApplicationError {
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
}

export function adaptStudioRenameError(error: ApplicationError): ApplicationError {
  return error._tag === "VersionConflictFailure" ? StudioNameVersionConflictFailure.make() : error;
}

export function adaptStudioSaveError(error: ApplicationError): ApplicationError {
  if (error._tag === "EntryDraftConflictFailure") {
    return StudioDraftVersionConflictFailure.make({ details: error.details });
  }
  return error._tag === "EntryCommandConflictFailure" ? StudioCommandConflictFailure.make() : error;
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
  return Schema.decodeUnknown(StudioContentScope)({ projectId, environmentId }).pipe(
    Effect.mapError(() => invalidPath()),
  );
}

export function decodeStudioCollectionLocaleScope(
  projectId: string,
  environmentId: string,
  collectionId: string,
  locale: string,
) {
  return Schema.decodeUnknown(StudioCollectionLocaleScope)({
    projectId,
    environmentId,
    collectionId,
    locale,
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioListEntriesQuery(value: unknown) {
  return Schema.decodeUnknown(StudioListEntriesQuery)(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioSearchEntriesRequest(value: unknown) {
  return Schema.decodeUnknown(StudioSearchEntriesRequest)(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioCreateEntryRequest(value: unknown) {
  return Schema.decodeUnknown(StudioCreateEntryRequest)(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioRenameEntryRequest(value: unknown) {
  return Schema.decodeUnknown(StudioRenameEntryRequest)(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

export function decodeStudioSaveEntryDraftRequest(value: unknown) {
  return Schema.decodeUnknown(StudioSaveEntryDraftRequest)(value, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError(() => invalidPath()));
}

/** Revalidates immutable Studio grant authority before entering content policy. */
export const revalidateStudioContentPrincipal = Effect.fn(
  "studio_content.public.principal.revalidate",
)(function* (principal: StudioOAuthPrincipal, scope: StudioContentScope) {
  yield* (yield* StudioRepository).getBootstrap({
    principal,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
});

export const studioNestedCollectionOperations = [
  "browse",
  "search",
  "new_workspace",
  "entry_workspace",
  "create",
  "rename",
  "save",
] as const;
export type StudioNestedCollectionOperation = (typeof studioNestedCollectionOperations)[number];

function decodeActorId(principal: StudioOAuthPrincipal) {
  return Schema.decodeUnknown(AuthUserId)(principal.userId).pipe(
    Effect.mapError(() => invalidPath()),
  );
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

/** Applies one shared projection/configuration gate before every nested collection operation. */
export const authorizeStudioCollectionOperation = Effect.fn(
  "studio_content.public.collection.authorize",
)(function* (
  principal: StudioOAuthPrincipal,
  scope: StudioCollectionLocaleScopeType,
  operation: StudioNestedCollectionOperation,
  now: Date,
) {
  const cost =
    operation === "browse" || operation === "search"
      ? 1
      : operation === "new_workspace"
        ? 2
        : operation === "entry_workspace"
          ? 3
          : 5;
  yield* evaluateStudioUserRateLimit(principal, cost);
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
  principal: StudioOAuthPrincipal,
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
  return Schema.decodeUnknownSync(StudioEntryPage)({ ...result.page, nextCursor });
});

export const browseStudioEntries = Effect.fn("studio_content.public.entries.browse")(function* (
  principal: StudioOAuthPrincipal,
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
  principal: StudioOAuthPrincipal,
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
  const issues = validation.issues.filter((issue) => visibleFieldIds.has(issue.fieldId));
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
  return Schema.decodeUnknownSync(StudioEntrySummary)({
    id: entry.id,
    displayName: entry.displayName,
    nameVersion: entry.nameVersion,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

export function decodeStudioEntryId(value: string) {
  return Schema.decodeUnknown(EntryId)(value).pipe(Effect.mapError(() => invalidPath()));
}

export const getStudioNewEntryWorkspace = Effect.fn("studio_content.public.workspace.new")(
  function* (principal: StudioOAuthPrincipal, scope: StudioCollectionLocaleScopeType, now: Date) {
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
    return Schema.decodeUnknownSync(StudioNewEntryWorkspace)({
      localeId: authority.localeId,
      locale: authority.locale,
      form: projectStudioForm(form),
      capabilities: {
        canCreate: authority.canCreate,
        canRename: authority.canRename,
        canSaveLocalized: authority.canWriteLocalized,
        canSaveShared: authority.canWriteShared,
      },
    });
  },
);

export const getStudioEntryWorkspace = Effect.fn("studio_content.public.workspace.entry")(
  function* (
    principal: StudioOAuthPrincipal,
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
    return Schema.decodeUnknownSync(StudioEntryWorkspace)({
      localeId: authority.localeId,
      locale: authority.locale,
      form: projectedForm,
      capabilities: {
        canCreate: authority.canCreate,
        canRename: authority.canRename,
        canSaveLocalized: authority.canWriteLocalized,
        canSaveShared: authority.canWriteShared,
      },
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
  principal: StudioOAuthPrincipal,
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
  return Schema.decodeUnknownSync(StudioCreateEntryResult)({
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
  principal: StudioOAuthPrincipal,
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
  principal: StudioOAuthPrincipal,
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
  return Schema.decodeUnknownSync(StudioMutationReceipt)({
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
  principal: StudioOAuthPrincipal,
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

/** Adapts the content scope to the accepted bootstrap verifier without changing Studio v1. */
export function studioBootstrapScope(scope: StudioContentScope): StudioBootstrapScope {
  return StudioBootstrapScope.make({
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
}
