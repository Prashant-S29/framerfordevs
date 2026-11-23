import { db } from "@framerfordevs/db";
import { and, desc, eq, lte } from "@framerfordevs/db/query";
import {
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleRevision,
  cmsEntrySharedRevision,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { PreviewTargetUrl } from "../../contracts/control-plane";
import { EntryId, EntryRevisionId } from "../../contracts/entry";
import { LocaleTag } from "../../contracts/locale";
import type {
  PreviewHandoffClaims,
  PreviewHandoffIssuer,
  PreviewHandoffRequest,
} from "../../contracts/preview-handoff";
import { type AuthUserId, EnvironmentId, ProjectId, WorkspaceId } from "../../contracts/platform";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  CredentialInvalidFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  PreviewRevisionIncompatibleFailure,
  PreviewTargetRequiredFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import { CollectionId, SchemaRevisionId } from "../../contracts/schema";
import { selectPreviewTarget } from "../preview-target/repository";
import {
  authorizeCmsActorProject,
  type ApplicationDb,
  type ApplicationExecutor,
} from "../project-access";
import type { PreviewHandoffClaimsInput } from "./signer";

export interface PreviewHandoffScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly locale: string;
}

type RevisionRow = {
  readonly id: string;
  readonly commandId: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly authoredAt: Date;
};

async function selectRevision(
  executor: ApplicationExecutor,
  scope: PreviewHandoffScope & { readonly workspaceId: string; readonly localeId: string },
  revisionId: string,
) {
  const [shared] = await executor
    .select()
    .from(cmsEntrySharedRevision)
    .where(
      and(
        eq(cmsEntrySharedRevision.id, revisionId),
        eq(cmsEntrySharedRevision.entryId, scope.entryId),
        eq(cmsEntrySharedRevision.workspaceId, scope.workspaceId),
        eq(cmsEntrySharedRevision.projectId, scope.projectId),
        eq(cmsEntrySharedRevision.environmentId, scope.environmentId),
        eq(cmsEntrySharedRevision.collectionId, scope.collectionId),
      ),
    )
    .limit(1);
  if (shared) return { scope: "shared", row: shared } as const;
  const [localized] = await executor
    .select()
    .from(cmsEntryLocaleRevision)
    .where(
      and(
        eq(cmsEntryLocaleRevision.id, revisionId),
        eq(cmsEntryLocaleRevision.entryId, scope.entryId),
        eq(cmsEntryLocaleRevision.localeId, scope.localeId),
        eq(cmsEntryLocaleRevision.workspaceId, scope.workspaceId),
        eq(cmsEntryLocaleRevision.projectId, scope.projectId),
        eq(cmsEntryLocaleRevision.environmentId, scope.environmentId),
        eq(cmsEntryLocaleRevision.collectionId, scope.collectionId),
      ),
    )
    .limit(1);
  return localized ? ({ scope: "localized", row: localized } as const) : null;
}

// A revision belongs to one scope, so a preview pairs it with the other scope's revision. The
// draft command that created the selected revision records both scope heads after it ran, which
// gives the exact pair. A command in another locale has no localized head for this locale, so the
// pair then falls back to the latest revision authored at or before the selected one.
async function pairedRevision(
  executor: ApplicationExecutor,
  scope: PreviewHandoffScope & { readonly workspaceId: string; readonly localeId: string },
  selected: { readonly scope: "shared" | "localized"; readonly row: RevisionRow },
): Promise<RevisionRow | null> {
  const [command] = await executor
    .select({
      localeId: cmsEntryDraftCommand.localeId,
      sharedRevisionId: cmsEntryDraftCommand.resultSharedRevisionId,
      localeRevisionId: cmsEntryDraftCommand.resultLocaleRevisionId,
    })
    .from(cmsEntryDraftCommand)
    .where(
      and(
        eq(cmsEntryDraftCommand.entryId, scope.entryId),
        eq(cmsEntryDraftCommand.commandId, selected.row.commandId),
        eq(cmsEntryDraftCommand.workspaceId, scope.workspaceId),
        eq(cmsEntryDraftCommand.projectId, scope.projectId),
        eq(cmsEntryDraftCommand.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  const exactId =
    command === undefined || command.localeId !== scope.localeId
      ? undefined
      : selected.scope === "localized"
        ? command.sharedRevisionId
        : command.localeRevisionId;
  if (exactId === null) return null;
  if (exactId !== undefined) {
    const paired = await selectRevision(executor, scope, exactId);
    return paired?.row ?? null;
  }
  if (selected.scope === "localized") {
    const [row] = await executor
      .select()
      .from(cmsEntrySharedRevision)
      .where(
        and(
          eq(cmsEntrySharedRevision.entryId, scope.entryId),
          eq(cmsEntrySharedRevision.workspaceId, scope.workspaceId),
          eq(cmsEntrySharedRevision.projectId, scope.projectId),
          eq(cmsEntrySharedRevision.environmentId, scope.environmentId),
          lte(cmsEntrySharedRevision.authoredAt, selected.row.authoredAt),
        ),
      )
      .orderBy(desc(cmsEntrySharedRevision.sequence))
      .limit(1);
    return row ?? null;
  }
  const [row] = await executor
    .select()
    .from(cmsEntryLocaleRevision)
    .where(
      and(
        eq(cmsEntryLocaleRevision.entryId, scope.entryId),
        eq(cmsEntryLocaleRevision.localeId, scope.localeId),
        eq(cmsEntryLocaleRevision.workspaceId, scope.workspaceId),
        eq(cmsEntryLocaleRevision.projectId, scope.projectId),
        eq(cmsEntryLocaleRevision.environmentId, scope.environmentId),
        lte(cmsEntryLocaleRevision.authoredAt, selected.row.authoredAt),
      ),
    )
    .orderBy(desc(cmsEntryLocaleRevision.sequence))
    .limit(1);
  return row ?? null;
}

function invalidRequest() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "revisionId",
        code: "preview_source_invalid",
        message: "A current preview has no revision, and a revision preview needs one.",
      }),
    ],
  });
}

export function makePreviewHandoffRepository(options: { readonly database?: ApplicationDb } = {}) {
  const database = options.database ?? db;

  return {
    prepare: Effect.fn("PreviewHandoffRepository.prepare")(function* (
      actorId: AuthUserId,
      scope: PreviewHandoffScope,
      request: PreviewHandoffRequest,
      issuer: PreviewHandoffIssuer,
      requestId: string,
    ) {
      if ((request.source === "current") !== (request.revisionId === null)) {
        return yield* invalidRequest();
      }
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [locale] = await transaction
              .select({ id: projectLocale.id, workspaceId: projectLocale.workspaceId })
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.projectId, scope.projectId),
                  eq(projectLocale.tag, scope.locale),
                  eq(projectLocale.status, "enabled"),
                ),
              )
              .limit(1);
            if (!locale) return { kind: "not_found" } as const;
            const authorization = await authorizeCmsActorProject(
              transaction,
              { kind: "user", id: actorId },
              scope.projectId,
              scope.environmentId,
              "content.read",
              locale.id,
            );
            if (authorization.kind === "not_found") return { kind: "not_found" } as const;
            if (authorization.kind === "forbidden") return { kind: "forbidden" } as const;
            const workspaceId = authorization.access.project.workspaceId;
            if (workspaceId !== locale.workspaceId) return { kind: "not_found" } as const;
            const [entry] = await transaction
              .select({ id: cmsEntry.id })
              .from(cmsEntry)
              .where(
                and(
                  eq(cmsEntry.id, scope.entryId),
                  eq(cmsEntry.workspaceId, workspaceId),
                  eq(cmsEntry.projectId, scope.projectId),
                  eq(cmsEntry.environmentId, scope.environmentId),
                  eq(cmsEntry.collectionId, scope.collectionId),
                ),
              )
              .limit(1);
            if (!entry) return { kind: "not_found" } as const;
            const target = await selectPreviewTarget(transaction, {
              workspaceId,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
            });
            if (!target || target.previewUrl === null) return { kind: "target_required" } as const;

            let revisions: {
              readonly schemaRevisionId: string | null;
              readonly sharedRevisionId: string | null;
              readonly localizedRevisionId: string | null;
            } = { schemaRevisionId: null, sharedRevisionId: null, localizedRevisionId: null };
            if (request.revisionId !== null) {
              const revisionScope = { ...scope, workspaceId, localeId: locale.id };
              const selected = await selectRevision(transaction, revisionScope, request.revisionId);
              if (selected === null) return { kind: "not_found" } as const;
              const paired = await pairedRevision(transaction, revisionScope, selected);
              if (
                paired !== null &&
                (paired.schemaRevisionId !== selected.row.schemaRevisionId ||
                  paired.contractHash !== selected.row.contractHash)
              ) {
                return { kind: "incompatible" } as const;
              }
              revisions = {
                schemaRevisionId: selected.row.schemaRevisionId,
                sharedRevisionId:
                  selected.scope === "shared" ? selected.row.id : (paired?.id ?? null),
                localizedRevisionId:
                  selected.scope === "localized" ? selected.row.id : (paired?.id ?? null),
              };
            }
            await transaction.insert(auditEvent).values({
              workspaceId,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              actorType: "user",
              actorId,
              action: "cms.entry.preview.handoff.issued",
              resourceType: "cms_entry",
              resourceId: scope.entryId,
              requestId,
            });
            return {
              kind: "success",
              workspaceId,
              previewUrl: target.previewUrl,
              targetVersion: target.version,
              revisions,
            } as const;
          }),
        catch: (cause) => DatabaseFailure.make({ operation: "preview_handoff.prepare", cause }),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "entry" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "target_required":
          return yield* PreviewTargetRequiredFailure.make();
        case "incompatible":
          return yield* PreviewRevisionIncompatibleFailure.make();
        case "success": {
          const decode = <A, I>(schema: Schema.Codec<A, I>, value: unknown) =>
            Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
          const claims: PreviewHandoffClaimsInput = {
            issuer,
            userId: actorId,
            workspaceId: decode(WorkspaceId, result.workspaceId),
            projectId: decode(ProjectId, scope.projectId),
            environmentId: decode(EnvironmentId, scope.environmentId),
            collectionId: decode(CollectionId, scope.collectionId),
            entryId: decode(EntryId, scope.entryId),
            locale: decode(LocaleTag, scope.locale),
            source: request.source,
            schemaRevisionId:
              result.revisions.schemaRevisionId === null
                ? null
                : decode(SchemaRevisionId, result.revisions.schemaRevisionId),
            sharedRevisionId:
              result.revisions.sharedRevisionId === null
                ? null
                : decode(EntryRevisionId, result.revisions.sharedRevisionId),
            localizedRevisionId:
              result.revisions.localizedRevisionId === null
                ? null
                : decode(EntryRevisionId, result.revisions.localizedRevisionId),
            targetVersion: result.targetVersion,
          };
          return { claims, previewUrl: decode(PreviewTargetUrl, result.previewUrl) };
        }
      }
    }),

    assertCurrentTarget: Effect.fn("PreviewHandoffRepository.assertCurrentTarget")(function* (
      claims: PreviewHandoffClaims,
    ) {
      const target = yield* Effect.tryPromise({
        try: () =>
          selectPreviewTarget(database, {
            workspaceId: claims.workspaceId,
            projectId: claims.projectId,
            environmentId: claims.environmentId,
          }),
        catch: (cause) => DatabaseFailure.make({ operation: "preview_handoff.target", cause }),
      });
      if (!target || target.previewUrl === null || target.version !== claims.targetVersion) {
        return yield* CredentialInvalidFailure.make();
      }
    }),
  };
}

export class PreviewHandoffRepository extends Context.Service<
  PreviewHandoffRepository,
  ReturnType<typeof makePreviewHandoffRepository>
>()("PreviewHandoffRepository") {}

export const PreviewHandoffRepositoryLive = Layer.succeed(
  PreviewHandoffRepository,
  makePreviewHandoffRepository(),
);
