// Resolves exact Preview authority, compiles bounded draft sources, and audits successful reads atomically.

import { db } from "@framerfordevs/db";
import { and, eq, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryLocaleDraft,
  cmsEntryLocaleRevision,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
} from "@framerfordevs/db/schema/platform";
import { Context, Effect, Either, Layer, Schema } from "effect";

import {
  ProjectRole,
  type CredentialPrincipal as CredentialPrincipalValue,
} from "../contracts/access";
import type { EntryValues } from "../contracts/entries";
import {
  CmsCapabilityRequiredFailure,
  CredentialInvalidFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  PreviewDocumentCorruptFailure,
  PreviewResponseTooLargeFailure,
  PreviewRevisionIncompatibleFailure,
  PublishedSchemaRequiredFailure,
} from "../contracts/errors";
import {
  type GetCurrentUserPreviewInput,
  type GetRevisionCredentialPreviewInput,
  type GetRevisionUserPreviewInput,
  PreviewItem,
  type PreviewRouteScope,
  previewLimits,
} from "../contracts/preview";
import type { AuthUserId } from "../contracts/platform";
import {
  CollectionFieldDefinition,
  defaultFieldEditorMetadata,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import { reconstructFieldTree } from "../lib/field-tree";
import {
  compilePreviewDocument,
  type CompilePreviewDocumentInput,
  type PreviewDocumentCompilationResult,
} from "../lib/preview-document";
import type { ApplicationDb, ApplicationExecutor, ApplicationTransaction } from "./project-access";
import { authorizeUserProject, selectUserProjectAccess } from "./project-access";
import { PreviewDocumentEngine } from "./preview-document-engine";
import { hashSchemaContract } from "./schema-engine";

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function withValue<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

const EntryValuesSchema = Schema.Record({ key: Schema.UUID, value: Schema.Unknown });

function decodeEntryValues(value: unknown): EntryValues | null {
  const decoded = Schema.decodeUnknownEither(EntryValuesSchema)(value);
  return Either.isLeft(decoded) ? null : decoded.right;
}

function decodeField(row: typeof cmsSchemaRevisionField.$inferSelect): CollectionField | null {
  const decoded = Schema.decodeUnknownEither(CollectionFieldDefinition)({
    id: row.fieldId,
    parentFieldId: row.parentFieldId,
    nodeRole: row.nodeRole,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    editor:
      Object.keys(row.editorMetadata).length === 0
        ? defaultFieldEditorMetadata
        : row.editorMetadata,
    configuration: row.configuration,
    children: [],
  });
  return Either.isLeft(decoded) ? null : decoded.right;
}

interface ResolvedPreviewScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collection: typeof cmsCollection.$inferSelect;
  readonly entry: typeof cmsEntry.$inferSelect;
  readonly locale: typeof projectLocale.$inferSelect;
  readonly role: typeof ProjectRole.Type | null;
  readonly actorType: "user" | "credential";
  readonly actorId: string;
}

type ScopeResult =
  | { readonly kind: "success"; readonly scope: ResolvedPreviewScope }
  | { readonly kind: "credential_invalid" }
  | { readonly kind: "not_found" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "locale_unavailable" }
  | { readonly kind: "cms_required" }
  | { readonly kind: "invalid_state" }
  | { readonly kind: "corrupt" };

async function selectCollectionAndEntry(
  executor: ApplicationExecutor,
  options: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId?: string;
    readonly collectionKey?: string;
    readonly entryId: string;
  },
) {
  const collectionPredicates = [
    eq(cmsCollection.workspaceId, options.workspaceId),
    eq(cmsCollection.projectId, options.projectId),
    eq(cmsCollection.environmentId, options.environmentId),
  ];
  if (options.collectionId !== undefined) {
    collectionPredicates.push(eq(cmsCollection.id, options.collectionId));
  }
  if (options.collectionKey !== undefined) {
    collectionPredicates.push(eq(cmsCollection.apiKey, options.collectionKey));
  }
  const [collection] = await executor
    .select()
    .from(cmsCollection)
    .where(and(...collectionPredicates))
    .limit(1);
  if (!collection) return null;
  const [entry] = await executor
    .select()
    .from(cmsEntry)
    .where(
      and(
        eq(cmsEntry.id, options.entryId),
        eq(cmsEntry.workspaceId, options.workspaceId),
        eq(cmsEntry.projectId, options.projectId),
        eq(cmsEntry.environmentId, options.environmentId),
        eq(cmsEntry.collectionId, collection.id),
      ),
    )
    .limit(1);
  return entry ? { collection, entry } : null;
}

async function resolveCredentialScope(
  executor: ApplicationExecutor,
  principal: CredentialPrincipalValue,
  input: PreviewRouteScope | GetRevisionCredentialPreviewInput,
): Promise<ScopeResult> {
  if (
    principal.family !== "preview" ||
    !principal.scopes.includes("preview.read") ||
    principal.projectId !== input.projectId
  ) {
    return outcome("credential_invalid");
  }
  const [projectRow] = await executor
    .select({ archivedAt: project.archivedAt })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.workspaceId, principal.workspaceId)))
    .limit(1);
  if (!projectRow || projectRow.archivedAt !== null) return outcome("not_found");
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, principal.environmentId),
        eq(environment.workspaceId, principal.workspaceId),
        eq(environment.projectId, input.projectId),
        eq(environment.key, input.environmentKey),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("credential_invalid");
  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, principal.workspaceId),
        eq(projectCapability.projectId, input.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("not_found");
  const [locale] = await executor
    .select()
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, principal.workspaceId),
        eq(projectLocale.projectId, input.projectId),
        sql`lower(${projectLocale.tag}) = lower(${input.locale})`,
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  if (!locale) return outcome("locale_unavailable");
  const selected = await selectCollectionAndEntry(executor, {
    workspaceId: principal.workspaceId,
    projectId: input.projectId,
    environmentId: principal.environmentId,
    collectionKey: input.collectionKey,
    entryId: input.entryId,
  });
  if (!selected) return outcome("not_found");
  return withValue("success", {
    scope: {
      workspaceId: principal.workspaceId,
      projectId: input.projectId,
      environmentId: principal.environmentId,
      collection: selected.collection,
      entry: selected.entry,
      locale,
      role: null,
      actorType: "credential",
      actorId: principal.credentialId,
    } satisfies ResolvedPreviewScope,
  });
}

async function resolveUserScope(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  input: GetCurrentUserPreviewInput | GetRevisionUserPreviewInput,
): Promise<ScopeResult> {
  const access = await selectUserProjectAccess(executor, actorId, input.projectId);
  if (!access) return outcome("not_found");
  const [locale] = await executor
    .select()
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, access.project.workspaceId),
        eq(projectLocale.projectId, input.projectId),
        sql`lower(${projectLocale.tag}) = lower(${input.locale})`,
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  if (!locale) return outcome("locale_unavailable");
  const authorization = await authorizeUserProject(
    executor,
    actorId,
    input.projectId,
    "content.read",
    locale.id,
  );
  if (authorization.kind === "not_found") return outcome("not_found");
  if (authorization.kind === "forbidden") return outcome("forbidden");
  if (authorization.access.project.archivedAt !== null) return outcome("invalid_state");
  const role = Schema.decodeUnknownEither(ProjectRole)(authorization.access.role);
  if (Either.isLeft(role)) return outcome("corrupt");
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.workspaceId, access.project.workspaceId),
        eq(environment.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("not_found");
  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, access.project.workspaceId),
        eq(projectCapability.projectId, input.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("cms_required");
  const selected = await selectCollectionAndEntry(executor, {
    workspaceId: access.project.workspaceId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
    entryId: input.entryId,
  });
  if (!selected) return outcome("not_found");
  return withValue("success", {
    scope: {
      workspaceId: access.project.workspaceId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      collection: selected.collection,
      entry: selected.entry,
      locale,
      role: role.right,
      actorType: "user",
      actorId,
    } satisfies ResolvedPreviewScope,
  });
}

interface LoadedContract {
  readonly revision: typeof cmsSchemaRevision.$inferSelect;
  readonly fields: ReadonlyArray<CollectionField>;
  readonly contractHash: string;
}

type ContractResult =
  | { readonly kind: "success"; readonly contract: LoadedContract }
  | { readonly kind: "not_found" }
  | { readonly kind: "corrupt" };

async function loadContract(
  executor: ApplicationExecutor,
  scope: ResolvedPreviewScope,
  revisionId: string,
): Promise<ContractResult> {
  const [revision] = await executor
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, revisionId),
        eq(cmsSchemaRevision.workspaceId, scope.workspaceId),
        eq(cmsSchemaRevision.projectId, scope.projectId),
        eq(cmsSchemaRevision.environmentId, scope.environmentId),
        eq(cmsSchemaRevision.collectionId, scope.collection.id),
      ),
    )
    .limit(1);
  if (!revision) return outcome("not_found");
  const rows = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(
      and(
        eq(cmsSchemaRevisionField.revisionId, revision.id),
        eq(cmsSchemaRevisionField.workspaceId, scope.workspaceId),
        eq(cmsSchemaRevisionField.projectId, scope.projectId),
        eq(cmsSchemaRevisionField.environmentId, scope.environmentId),
        eq(cmsSchemaRevisionField.collectionId, scope.collection.id),
      ),
    )
    .orderBy(
      cmsSchemaRevisionField.parentFieldId,
      cmsSchemaRevisionField.position,
      cmsSchemaRevisionField.fieldId,
    );
  const fields: Array<CollectionField> = [];
  for (const row of rows) {
    const field = decodeField(row);
    if (field === null) return outcome("corrupt");
    fields.push(field);
  }
  const tree = reconstructFieldTree(fields);
  if (!tree.valid) return outcome("corrupt");
  const contractHash = hashSchemaContract({
    formatVersion: revision.formatVersion,
    validationProfile: revision.validationProfile,
    currencyRegistryProfile: revision.currencyRegistryProfile,
    collectionApiKey: revision.collectionApiKey,
    fields: tree.roots,
  });
  return withValue("success", {
    contract: { revision, fields: tree.roots, contractHash },
  });
}

type CurrentContractResult =
  | { readonly kind: "success"; readonly contract: LoadedContract }
  | { readonly kind: "published_required" }
  | { readonly kind: "corrupt" };

async function loadCurrentContract(
  executor: ApplicationExecutor,
  scope: ResolvedPreviewScope,
): Promise<CurrentContractResult> {
  const [head] = await executor
    .select({ revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId })
    .from(cmsCollectionSchemaHead)
    .where(
      and(
        eq(cmsCollectionSchemaHead.collectionId, scope.collection.id),
        eq(cmsCollectionSchemaHead.workspaceId, scope.workspaceId),
        eq(cmsCollectionSchemaHead.projectId, scope.projectId),
        eq(cmsCollectionSchemaHead.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  if (!head) return outcome("corrupt");
  if (head.revisionId === null) return outcome("published_required");
  const loaded = await loadContract(executor, scope, head.revisionId);
  if (loaded.kind !== "success") return outcome("corrupt");
  return loaded;
}

interface LoadedSources {
  readonly sharedRevisionId: string | null;
  readonly sharedVersion: number;
  readonly sharedValues: EntryValues;
  readonly localizedRevisionId: string | null;
  readonly localizedVersion: number;
  readonly localizedValues: EntryValues;
}

type SourceResult =
  | { readonly kind: "success"; readonly sources: LoadedSources }
  | { readonly kind: "not_found" }
  | { readonly kind: "incompatible" }
  | { readonly kind: "corrupt" };

async function loadCurrentSources(
  executor: ApplicationExecutor,
  scope: ResolvedPreviewScope,
  afterSharedHeadRead?: () => Promise<void>,
): Promise<SourceResult> {
  const [sharedHead] = await executor
    .select()
    .from(cmsEntrySharedDraft)
    .where(
      and(
        eq(cmsEntrySharedDraft.entryId, scope.entry.id),
        eq(cmsEntrySharedDraft.workspaceId, scope.workspaceId),
        eq(cmsEntrySharedDraft.projectId, scope.projectId),
        eq(cmsEntrySharedDraft.environmentId, scope.environmentId),
        eq(cmsEntrySharedDraft.collectionId, scope.collection.id),
      ),
    )
    .limit(1);
  if (afterSharedHeadRead !== undefined) await afterSharedHeadRead();
  const [localizedHead] = await executor
    .select()
    .from(cmsEntryLocaleDraft)
    .where(
      and(
        eq(cmsEntryLocaleDraft.entryId, scope.entry.id),
        eq(cmsEntryLocaleDraft.localeId, scope.locale.id),
        eq(cmsEntryLocaleDraft.workspaceId, scope.workspaceId),
        eq(cmsEntryLocaleDraft.projectId, scope.projectId),
        eq(cmsEntryLocaleDraft.environmentId, scope.environmentId),
        eq(cmsEntryLocaleDraft.collectionId, scope.collection.id),
      ),
    )
    .limit(1);
  const [sharedRevision] = sharedHead
    ? await executor
        .select()
        .from(cmsEntrySharedRevision)
        .where(
          and(
            eq(cmsEntrySharedRevision.id, sharedHead.currentRevisionId),
            eq(cmsEntrySharedRevision.entryId, scope.entry.id),
            eq(cmsEntrySharedRevision.workspaceId, scope.workspaceId),
            eq(cmsEntrySharedRevision.projectId, scope.projectId),
            eq(cmsEntrySharedRevision.environmentId, scope.environmentId),
            eq(cmsEntrySharedRevision.collectionId, scope.collection.id),
            eq(cmsEntrySharedRevision.sequence, sharedHead.version),
          ),
        )
        .limit(1)
    : [];
  const [localizedRevision] = localizedHead
    ? await executor
        .select()
        .from(cmsEntryLocaleRevision)
        .where(
          and(
            eq(cmsEntryLocaleRevision.id, localizedHead.currentRevisionId),
            eq(cmsEntryLocaleRevision.entryId, scope.entry.id),
            eq(cmsEntryLocaleRevision.localeId, scope.locale.id),
            eq(cmsEntryLocaleRevision.workspaceId, scope.workspaceId),
            eq(cmsEntryLocaleRevision.projectId, scope.projectId),
            eq(cmsEntryLocaleRevision.environmentId, scope.environmentId),
            eq(cmsEntryLocaleRevision.collectionId, scope.collection.id),
            eq(cmsEntryLocaleRevision.sequence, localizedHead.version),
          ),
        )
        .limit(1)
    : [];
  if ((sharedHead && !sharedRevision) || (localizedHead && !localizedRevision)) {
    return outcome("corrupt");
  }
  const sharedValues = decodeEntryValues(sharedRevision?.values ?? {});
  const localizedValues = decodeEntryValues(localizedRevision?.values ?? {});
  if (sharedValues === null || localizedValues === null) return outcome("corrupt");
  return withValue("success", {
    sources: {
      sharedRevisionId: sharedRevision?.id ?? null,
      sharedVersion: sharedHead?.version ?? 0,
      sharedValues,
      localizedRevisionId: localizedRevision?.id ?? null,
      localizedVersion: localizedHead?.version ?? 0,
      localizedValues,
    },
  });
}

async function loadRevisionSources(
  executor: ApplicationExecutor,
  scope: ResolvedPreviewScope,
  contract: LoadedContract,
  selected: {
    readonly sharedRevisionId: string | null;
    readonly localizedRevisionId: string | null;
  },
): Promise<SourceResult> {
  const [sharedRevision] =
    selected.sharedRevisionId === null
      ? []
      : await executor
          .select()
          .from(cmsEntrySharedRevision)
          .where(
            and(
              eq(cmsEntrySharedRevision.id, selected.sharedRevisionId),
              eq(cmsEntrySharedRevision.entryId, scope.entry.id),
              eq(cmsEntrySharedRevision.workspaceId, scope.workspaceId),
              eq(cmsEntrySharedRevision.projectId, scope.projectId),
              eq(cmsEntrySharedRevision.environmentId, scope.environmentId),
              eq(cmsEntrySharedRevision.collectionId, scope.collection.id),
            ),
          )
          .limit(1);
  const [localizedRevision] =
    selected.localizedRevisionId === null
      ? []
      : await executor
          .select()
          .from(cmsEntryLocaleRevision)
          .where(
            and(
              eq(cmsEntryLocaleRevision.id, selected.localizedRevisionId),
              eq(cmsEntryLocaleRevision.entryId, scope.entry.id),
              eq(cmsEntryLocaleRevision.localeId, scope.locale.id),
              eq(cmsEntryLocaleRevision.workspaceId, scope.workspaceId),
              eq(cmsEntryLocaleRevision.projectId, scope.projectId),
              eq(cmsEntryLocaleRevision.environmentId, scope.environmentId),
              eq(cmsEntryLocaleRevision.collectionId, scope.collection.id),
            ),
          )
          .limit(1);
  if (
    (selected.sharedRevisionId !== null && !sharedRevision) ||
    (selected.localizedRevisionId !== null && !localizedRevision)
  ) {
    return outcome("not_found");
  }
  if (
    (sharedRevision &&
      (sharedRevision.schemaRevisionId !== contract.revision.id ||
        sharedRevision.contractHash !== contract.contractHash)) ||
    (localizedRevision &&
      (localizedRevision.schemaRevisionId !== contract.revision.id ||
        localizedRevision.contractHash !== contract.contractHash))
  ) {
    return outcome("incompatible");
  }
  const sharedValues = decodeEntryValues(sharedRevision?.values ?? {});
  const localizedValues = decodeEntryValues(localizedRevision?.values ?? {});
  if (sharedValues === null || localizedValues === null) return outcome("corrupt");
  return withValue("success", {
    sources: {
      sharedRevisionId: sharedRevision?.id ?? null,
      sharedVersion: sharedRevision?.sequence ?? 0,
      sharedValues,
      localizedRevisionId: localizedRevision?.id ?? null,
      localizedVersion: localizedRevision?.sequence ?? 0,
      localizedValues,
    },
  });
}

type PreviewSelection =
  | { readonly kind: "current" }
  | {
      readonly kind: "revision";
      readonly schemaRevisionId: string;
      readonly sharedRevisionId: string | null;
      readonly localizedRevisionId: string | null;
    };

type PreviewSubject =
  | {
      readonly kind: "credential";
      readonly principal: CredentialPrincipalValue;
      readonly input: PreviewRouteScope | GetRevisionCredentialPreviewInput;
    }
  | {
      readonly kind: "user";
      readonly actorId: AuthUserId;
      readonly input: GetCurrentUserPreviewInput | GetRevisionUserPreviewInput;
    };

interface PreviewReadRequest {
  readonly subject: PreviewSubject;
  readonly selection: PreviewSelection;
  readonly now: Date;
  readonly requestId: string;
}

type ReadResult =
  | { readonly kind: "success"; readonly item: PreviewItem }
  | Exclude<ScopeResult, { readonly kind: "success" }>
  | { readonly kind: "published_required" }
  | { readonly kind: "incompatible" }
  | { readonly kind: "too_large" };

class PreviewAuditPersistenceError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Preview audit persistence failed.");
    this.cause = cause;
  }
}

async function persistAudit(
  transaction: ApplicationTransaction,
  scope: ResolvedPreviewScope,
  selection: PreviewSelection,
  now: Date,
  requestId: string,
): Promise<void> {
  await transaction.insert(auditEvent).values({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    actorType: scope.actorType,
    actorId: scope.actorId,
    action:
      selection.kind === "current"
        ? "cms.entry.preview.current.read"
        : "cms.entry.preview.revision.read",
    resourceType: "cms_entry",
    resourceId: scope.entry.id,
    requestId,
    occurredAt: now,
  });
}

function postgresSqlState(cause: unknown, depth = 0): string | undefined {
  if (depth > 4 || typeof cause !== "object" || cause === null) return undefined;
  const code = Reflect.get(cause, "code");
  if (typeof code === "string") return code;
  const nested = Reflect.get(cause, "cause");
  return nested === undefined ? undefined : postgresSqlState(nested, depth + 1);
}

export interface PreviewRepositoryOptions {
  readonly database?: ApplicationDb;
  readonly compile?: (input: CompilePreviewDocumentInput) => PreviewDocumentCompilationResult;
  readonly runTransaction?: <A>(
    work: (transaction: ApplicationTransaction) => Promise<A>,
  ) => Promise<A>;
  readonly testFailBeforeAudit?: boolean;
  readonly testAfterSharedHeadRead?: () => Promise<void>;
}

/** Creates the short repeatable-read Preview adapter over the shared database pool. */
export function makePreviewRepository(options: PreviewRepositoryOptions = {}) {
  const database = options.database ?? db;
  const compile = options.compile ?? compilePreviewDocument;
  const runTransaction =
    options.runTransaction ??
    (<A>(work: (transaction: ApplicationTransaction) => Promise<A>) =>
      database.transaction(work, {
        isolationLevel: "repeatable read",
        accessMode: "read write",
      }));

  const runOnce = (request: PreviewReadRequest) =>
    runTransaction(async (transaction): Promise<ReadResult> => {
      await transaction.execute(sql`set local statement_timeout = '750ms'`);
      await transaction.execute(sql`set local idle_in_transaction_session_timeout = '2000ms'`);
      const resolved =
        request.subject.kind === "credential"
          ? await resolveCredentialScope(
              transaction,
              request.subject.principal,
              request.subject.input,
            )
          : await resolveUserScope(transaction, request.subject.actorId, request.subject.input);
      if (resolved.kind !== "success") return resolved;
      const contract =
        request.selection.kind === "current"
          ? await loadCurrentContract(transaction, resolved.scope)
          : await loadContract(transaction, resolved.scope, request.selection.schemaRevisionId);
      if (contract.kind !== "success") return contract;
      const sources =
        request.selection.kind === "current"
          ? await loadCurrentSources(transaction, resolved.scope, options.testAfterSharedHeadRead)
          : await loadRevisionSources(transaction, resolved.scope, contract.contract, {
              sharedRevisionId: request.selection.sharedRevisionId,
              localizedRevisionId: request.selection.localizedRevisionId,
            });
      if (sources.kind !== "success") return sources;
      const compilation = compile({
        entryId: resolved.scope.entry.id,
        collectionId: resolved.scope.collection.id,
        collectionKey: contract.contract.revision.collectionApiKey,
        locale: resolved.scope.locale.tag,
        fields: contract.contract.fields,
        sharedValues: sources.sources.sharedValues,
        localizedValues: sources.sources.localizedValues,
        authority: {
          source: request.selection.kind,
          schemaRevisionId: contract.contract.revision.id,
          contractHash: contract.contract.contractHash,
          sharedRevisionId: sources.sources.sharedRevisionId,
          sharedVersion: sources.sources.sharedVersion,
          localizedRevisionId: sources.sources.localizedRevisionId,
          localizedVersion: sources.sources.localizedVersion,
        },
        role: resolved.scope.role,
      });
      if (!compilation.ok) return outcome("corrupt");
      if (compilation.responseBytes > previewLimits.responseBytes) return outcome("too_large");
      const item = Schema.decodeUnknownEither(PreviewItem)(compilation.item);
      if (Either.isLeft(item)) return outcome("corrupt");
      try {
        if (options.testFailBeforeAudit) throw new Error("Injected Preview audit failure.");
        await persistAudit(
          transaction,
          resolved.scope,
          request.selection,
          request.now,
          request.requestId,
        );
      } catch (cause) {
        throw new PreviewAuditPersistenceError(cause);
      }
      return withValue("success", { item: item.right });
    });

  const runWithSerializationRetry = async (request: PreviewReadRequest): Promise<ReadResult> => {
    try {
      return await runOnce(request);
    } catch (cause) {
      if (postgresSqlState(cause) !== "40001") throw cause;
      return runOnce(request);
    }
  };

  const read = Effect.fn("PreviewRepository.read")(function* (request: PreviewReadRequest) {
    const result = yield* Effect.tryPromise({
      try: () => runWithSerializationRetry(request),
      catch: (cause) =>
        databaseFailure(
          cause instanceof PreviewAuditPersistenceError ? "preview.audit" : "preview.read",
          cause,
        ),
    });
    switch (result.kind) {
      case "success":
        return result.item;
      case "credential_invalid":
        return yield* CredentialInvalidFailure.make();
      case "not_found":
        return yield* NotFoundFailure.make({ resource: "entry" });
      case "forbidden":
        return yield* ForbiddenFailure.make();
      case "locale_unavailable":
        return yield* LocaleUnavailableFailure.make();
      case "cms_required":
        return yield* CmsCapabilityRequiredFailure.make();
      case "invalid_state":
        return yield* InvalidStateTransitionFailure.make();
      case "published_required":
        return yield* PublishedSchemaRequiredFailure.make();
      case "incompatible":
        return yield* PreviewRevisionIncompatibleFailure.make();
      case "too_large":
        return yield* PreviewResponseTooLargeFailure.make();
      case "corrupt":
        return yield* PreviewDocumentCorruptFailure.make();
    }
  });

  return {
    getCredentialCurrent: Effect.fn("PreviewRepository.getCredentialCurrent")(function* (
      principal: CredentialPrincipalValue,
      input: PreviewRouteScope,
      now: Date,
      requestId: string,
    ) {
      return yield* read({
        subject: { kind: "credential", principal, input },
        selection: { kind: "current" },
        now,
        requestId,
      });
    }),

    getCredentialRevision: Effect.fn("PreviewRepository.getCredentialRevision")(function* (
      principal: CredentialPrincipalValue,
      input: GetRevisionCredentialPreviewInput,
      now: Date,
      requestId: string,
    ) {
      return yield* read({
        subject: { kind: "credential", principal, input },
        selection: {
          kind: "revision",
          schemaRevisionId: input.schemaRevisionId,
          sharedRevisionId: input.sharedRevisionId,
          localizedRevisionId: input.localizedRevisionId,
        },
        now,
        requestId,
      });
    }),

    getUserCurrent: Effect.fn("PreviewRepository.getUserCurrent")(function* (
      actorId: AuthUserId,
      input: GetCurrentUserPreviewInput,
      now: Date,
      requestId: string,
    ) {
      return yield* read({
        subject: { kind: "user", actorId, input },
        selection: { kind: "current" },
        now,
        requestId,
      });
    }),

    getUserRevision: Effect.fn("PreviewRepository.getUserRevision")(function* (
      actorId: AuthUserId,
      input: GetRevisionUserPreviewInput,
      now: Date,
      requestId: string,
    ) {
      return yield* read({
        subject: { kind: "user", actorId, input },
        selection: {
          kind: "revision",
          schemaRevisionId: input.schemaRevisionId,
          sharedRevisionId: input.sharedRevisionId,
          localizedRevisionId: input.localizedRevisionId,
        },
        now,
        requestId,
      });
    }),
  };
}

export class PreviewRepository extends Context.Tag("PreviewRepository")<
  PreviewRepository,
  ReturnType<typeof makePreviewRepository>
>() {}

export const PreviewRepositoryLive = Layer.effect(
  PreviewRepository,
  Effect.gen(function* () {
    const engine = yield* PreviewDocumentEngine;
    return makePreviewRepository({ compile: engine.compileSync });
  }),
);
