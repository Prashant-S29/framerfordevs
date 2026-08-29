// Projects authorized stable-ID CMS drafts into the tenant-neutral Authoring API-key contract.

import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { Context, Effect, Layer, Schema } from "effect";

import { ProjectRole } from "../../contracts/access";
import {
  AuthoringEntryDraft,
  AuthoringEntrySummary,
  AuthoringGeneratedForm,
  AuthoringEntryValidation,
  AuthoringEntryValidationIssue,
  AuthoringEntryValues,
} from "../../contracts/authoring/content";
import type { CmsActor } from "../../contracts/authoring";
import { EditorLayout } from "../../contracts/field";
import type { CmsEntry, CmsEntryDraft, EntryValues } from "../../contracts/entry";
import {
  DatabaseFailure,
  ForbiddenFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
} from "../../contracts/response/errors";
import {
  CollectionFieldDefinition,
  CollectionId,
  defaultFieldEditorMetadata,
  type CollectionFieldDefinition as CollectionField,
} from "../../contracts/schema";
import { reconstructFieldTree } from "../../lib/field/tree";
import { generatedFormDefinition, syntheticEditorLayout } from "../../lib/field/form-definition";
import type {
  AuthoringMutationFieldAuthority,
  AuthoringValueShape,
} from "../../lib/authoring/mutations";
import { authorizeCmsActorProject, type ApplicationDb } from "../project-access";
import { isRoleAllowed } from "../policy";
import { hashSchemaContract } from "../schema/engine";

async function resolveEnabledLocaleId(
  database: ApplicationDb,
  projectId: string,
  locale: string,
): Promise<string | null> {
  const [row] = await database
    .select({ id: projectLocale.id })
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.projectId, projectId),
        eq(projectLocale.tag, locale),
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

function fieldValue(row: typeof cmsSchemaRevisionField.$inferSelect): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
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
}

function projectFieldValue(field: CollectionField, value: unknown): unknown {
  if (
    field.kind === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const projected: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const childValue = Reflect.get(value, child.id);
      if (childValue !== undefined) projected[child.apiKey] = projectFieldValue(child, childValue);
    }
    return projected;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value) && item)
    return value.map((itemValue) => projectFieldValue(item, itemValue));
  return value;
}

function visible(field: CollectionField, role: string): boolean {
  return field.editor.visibleToRoles.some((candidate) => candidate === role);
}

function editable(field: CollectionField, role: string): boolean {
  return (
    visible(field, role) && field.editor.editableByRoles.some((candidate) => candidate === role)
  );
}

function valueShape(field: CollectionField, role: string): AuthoringValueShape {
  if (field.kind === "object") {
    return {
      kind: "object",
      fields: field.children.flatMap((child) =>
        child.apiKey === null || !visible(child, role)
          ? []
          : [
              {
                fieldId: child.id,
                apiKey: child.apiKey,
                editable: editable(child, role),
                shape: valueShape(child, role),
              },
            ],
      ),
    };
  }
  const item = field.children[0];
  return field.kind === "list" && item
    ? { kind: "list", item: valueShape(item, role) }
    : { kind: "scalar" };
}

function mutationAuthorities(
  fields: ReadonlyArray<CollectionField>,
  role: string,
): ReadonlyArray<AuthoringMutationFieldAuthority> {
  const authorities: Array<AuthoringMutationFieldAuthority> = [];
  const visit = (
    field: CollectionField,
    apiPath: ReadonlyArray<string>,
    stablePath: ReadonlyArray<typeof field.id>,
    inherited: "shared" | "localized" | null,
  ) => {
    if (field.apiKey === null || !visible(field, role)) return;
    const effective = inherited ?? field.localization;
    const nextApiPath = [...apiPath, field.apiKey];
    const nextStablePath = [...stablePath, field.id];
    if (effective === "shared" || effective === "localized") {
      authorities.push({
        apiPath: nextApiPath,
        stablePath: nextStablePath,
        scope: effective,
        editable: editable(field, role),
        valueShape: valueShape(field, role),
      });
    }
    if (field.kind !== "object") return;
    const childInherited = effective === "mixed" ? null : effective;
    for (const child of field.children) visit(child, nextApiPath, nextStablePath, childInherited);
  };
  for (const field of fields) visit(field, [], [], null);
  return authorities;
}

function projectValues(values: EntryValues, fields: ReadonlyArray<CollectionField>) {
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.apiKey === null) continue;
    const value = Reflect.get(values, field.id);
    if (value !== undefined) projected[field.apiKey] = projectFieldValue(field, value);
  }
  return Schema.decodeUnknownSync(AuthoringEntryValues)(projected);
}

export function authoringEntrySummary(entry: CmsEntry) {
  return Schema.decodeUnknownSync(AuthoringEntrySummary)({
    id: entry.id,
    displayName: entry.displayName ?? `Entry ${entry.id}`,
    nameVersion: entry.nameVersion,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

export function makeAuthoringContentRepository(database: ApplicationDb = db) {
  return {
    resolveCollection: Effect.fn("AuthoringContentRepository.resolveCollection")(function* (
      actor: CmsActor,
      input: {
        readonly projectId: string;
        readonly environmentId: string;
        readonly collectionKey: string;
        readonly locale: string;
        readonly action: "content.read" | "content.write" | "content.publish";
      },
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const localeId = await resolveEnabledLocaleId(database, input.projectId, input.locale);
          const authorization = await authorizeCmsActorProject(
            database,
            actor,
            input.projectId,
            input.environmentId,
            input.action,
            localeId,
          );
          if (authorization.kind !== "allowed") return authorization;
          const [collection] = await database
            .select({ id: cmsCollection.id })
            .from(cmsCollection)
            .where(
              and(
                eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
                eq(cmsCollection.projectId, input.projectId),
                eq(cmsCollection.environmentId, input.environmentId),
                eq(cmsCollection.apiKey, input.collectionKey),
              ),
            )
            .limit(1);
          if (collection === undefined) return { kind: "not_found" as const };
          return localeId === null
            ? { kind: "locale_unavailable" as const }
            : { kind: "success" as const, collectionId: collection.id };
        },
        catch: (cause) => DatabaseFailure.make({ operation: "authoring.content.resolve", cause }),
      });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind !== "success") return yield* NotFoundFailure.make({ resource: "collection" });
      return Schema.decodeUnknownSync(CollectionId)(result.collectionId);
    }),

    getPublishedForm: Effect.fn("AuthoringContentRepository.getPublishedForm")(function* (
      actor: CmsActor,
      input: {
        readonly projectId: string;
        readonly environmentId: string;
        readonly collectionKey: string;
      },
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeCmsActorProject(
            database,
            actor,
            input.projectId,
            input.environmentId,
            actor.kind === "user" ? "schema.read" : "content.read",
          );
          if (authorization.kind !== "allowed") return authorization;
          const [collection] = await database
            .select()
            .from(cmsCollection)
            .where(
              and(
                eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
                eq(cmsCollection.projectId, input.projectId),
                eq(cmsCollection.environmentId, input.environmentId),
                eq(cmsCollection.apiKey, input.collectionKey),
              ),
            )
            .limit(1);
          if (!collection) return { kind: "not_found" as const };
          const [head] = await database
            .select({ revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId })
            .from(cmsCollectionSchemaHead)
            .where(
              and(
                eq(cmsCollectionSchemaHead.workspaceId, collection.workspaceId),
                eq(cmsCollectionSchemaHead.projectId, collection.projectId),
                eq(cmsCollectionSchemaHead.environmentId, collection.environmentId),
                eq(cmsCollectionSchemaHead.collectionId, collection.id),
              ),
            )
            .limit(1);
          if (!head || head.revisionId === null) return { kind: "published_required" as const };
          const [revision, rows] = await Promise.all([
            database
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.id, head.revisionId),
                  eq(cmsSchemaRevision.workspaceId, collection.workspaceId),
                  eq(cmsSchemaRevision.projectId, collection.projectId),
                  eq(cmsSchemaRevision.environmentId, collection.environmentId),
                  eq(cmsSchemaRevision.collectionId, collection.id),
                ),
              )
              .limit(1)
              .then((items) => items[0]),
            database
              .select()
              .from(cmsSchemaRevisionField)
              .where(
                and(
                  eq(cmsSchemaRevisionField.revisionId, head.revisionId),
                  eq(cmsSchemaRevisionField.workspaceId, collection.workspaceId),
                  eq(cmsSchemaRevisionField.projectId, collection.projectId),
                  eq(cmsSchemaRevisionField.environmentId, collection.environmentId),
                  eq(cmsSchemaRevisionField.collectionId, collection.id),
                ),
              )
              .orderBy(
                cmsSchemaRevisionField.parentFieldId,
                cmsSchemaRevisionField.position,
                cmsSchemaRevisionField.fieldId,
              ),
          ]);
          if (!revision) throw new Error("Published Authoring revision is missing.");
          const tree = reconstructFieldTree(rows.map(fieldValue));
          if (!tree.valid) throw new Error("Published Authoring field tree is invalid.");
          const role = Schema.decodeUnknownSync(ProjectRole)(authorization.access.role);
          const canEdit =
            actor.kind === "user"
              ? isRoleAllowed(role, "content.write") &&
                (authorization.access.localeAccessMode === "all" ||
                  authorization.access.allowedLocaleIds.length > 0)
              : (
                  await authorizeCmsActorProject(
                    database,
                    actor,
                    input.projectId,
                    input.environmentId,
                    "content.write",
                  )
                ).kind === "allowed";
          return {
            kind: "success" as const,
            form: Schema.decodeUnknownSync(AuthoringGeneratedForm)(
              generatedFormDefinition({
                source: "published",
                collectionId: collection.id,
                revisionId: revision.id,
                formatVersion: revision.formatVersion,
                validationProfile: revision.validationProfile,
                currencyRegistryProfile: revision.currencyRegistryProfile,
                contractHash: hashSchemaContract({
                  formatVersion: revision.formatVersion,
                  validationProfile: revision.validationProfile,
                  currencyRegistryProfile: revision.currencyRegistryProfile,
                  collectionApiKey: revision.collectionApiKey,
                  fields: tree.roots,
                }),
                role,
                canEdit,
                fields: tree.roots,
                editorLayout:
                  revision.editorLayout === null
                    ? syntheticEditorLayout(tree.roots)
                    : Schema.decodeUnknownSync(EditorLayout)(revision.editorLayout),
              }),
            ),
          };
        },
        catch: (cause) => DatabaseFailure.make({ operation: "authoring.content.form.get", cause }),
      });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      return result.form;
    }),

    resolveMutationAuthority: Effect.fn("AuthoringContentRepository.resolveMutationAuthority")(
      function* (
        actor: CmsActor,
        input: {
          readonly projectId: string;
          readonly environmentId: string;
          readonly collectionKey: string;
          readonly locale: string;
        },
      ) {
        const result = yield* Effect.tryPromise({
          try: async () => {
            const localeId = await resolveEnabledLocaleId(database, input.projectId, input.locale);
            const authorization = await authorizeCmsActorProject(
              database,
              actor,
              input.projectId,
              input.environmentId,
              "content.write",
              localeId,
            );
            if (authorization.kind !== "allowed") return authorization;
            const [collection] = await database
              .select()
              .from(cmsCollection)
              .where(
                and(
                  eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
                  eq(cmsCollection.projectId, input.projectId),
                  eq(cmsCollection.environmentId, input.environmentId),
                  eq(cmsCollection.apiKey, input.collectionKey),
                ),
              )
              .limit(1);
            if (!collection) return { kind: "not_found" as const };
            if (localeId === null) return { kind: "locale_unavailable" as const };
            const [head] = await database
              .select({ revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId })
              .from(cmsCollectionSchemaHead)
              .where(
                and(
                  eq(cmsCollectionSchemaHead.workspaceId, collection.workspaceId),
                  eq(cmsCollectionSchemaHead.projectId, collection.projectId),
                  eq(cmsCollectionSchemaHead.environmentId, collection.environmentId),
                  eq(cmsCollectionSchemaHead.collectionId, collection.id),
                ),
              )
              .limit(1);
            if (!head || head.revisionId === null) return { kind: "published_required" as const };
            const [revision] = await database
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.id, head.revisionId),
                  eq(cmsSchemaRevision.workspaceId, collection.workspaceId),
                  eq(cmsSchemaRevision.collectionId, collection.id),
                ),
              )
              .limit(1);
            if (!revision) throw new Error("Published Authoring revision is missing.");
            const rows = await database
              .select()
              .from(cmsSchemaRevisionField)
              .where(
                and(
                  eq(cmsSchemaRevisionField.revisionId, revision.id),
                  eq(cmsSchemaRevisionField.workspaceId, collection.workspaceId),
                  eq(cmsSchemaRevisionField.collectionId, collection.id),
                ),
              )
              .orderBy(
                cmsSchemaRevisionField.parentFieldId,
                cmsSchemaRevisionField.position,
                cmsSchemaRevisionField.fieldId,
              );
            const tree = reconstructFieldTree(rows.map(fieldValue));
            if (!tree.valid) throw new Error("Published Authoring field tree is invalid.");
            return {
              kind: "success" as const,
              collectionId: collection.id,
              revisionId: revision.id,
              contractHash: hashSchemaContract({
                formatVersion: revision.formatVersion,
                validationProfile: revision.validationProfile,
                currencyRegistryProfile: revision.currencyRegistryProfile,
                collectionApiKey: revision.collectionApiKey,
                fields: tree.roots,
              }),
              fields: mutationAuthorities(tree.roots, authorization.access.role),
            };
          },
          catch: (cause) =>
            DatabaseFailure.make({ operation: "authoring.content.authority", cause }),
        });
        if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
        if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
        if (result.kind === "not_found")
          return yield* NotFoundFailure.make({ resource: "collection" });
        if (result.kind === "published_required")
          return yield* PublishedSchemaRequiredFailure.make();
        return {
          collectionId: Schema.decodeUnknownSync(CollectionId)(result.collectionId),
          revisionId: result.revisionId,
          contractHash: result.contractHash,
          fields: result.fields,
        };
      },
    ),

    projectDraft: Effect.fn("AuthoringContentRepository.projectDraft")(function* (
      draft: CmsEntryDraft,
    ) {
      const rows = yield* Effect.tryPromise({
        try: () =>
          database
            .select()
            .from(cmsSchemaRevisionField)
            .where(
              and(
                eq(cmsSchemaRevisionField.revisionId, draft.schemaRevisionId),
                eq(cmsSchemaRevisionField.workspaceId, draft.entry.workspaceId),
                eq(cmsSchemaRevisionField.projectId, draft.entry.projectId),
                eq(cmsSchemaRevisionField.environmentId, draft.entry.environmentId),
                eq(cmsSchemaRevisionField.collectionId, draft.entry.collectionId),
              ),
            )
            .orderBy(
              cmsSchemaRevisionField.parentFieldId,
              cmsSchemaRevisionField.position,
              cmsSchemaRevisionField.fieldId,
            ),
        catch: (cause) => DatabaseFailure.make({ operation: "authoring.content.project", cause }),
      });
      const tree = reconstructFieldTree(rows.map(fieldValue));
      if (!tree.valid)
        return yield* Effect.die(new Error("Published Authoring field tree is invalid."));
      return AuthoringEntryDraft.make({
        entry: authoringEntrySummary(draft.entry),
        locale: draft.locale,
        schemaRevisionId: draft.schemaRevisionId,
        contractHash: draft.contractHash,
        sharedVersion: draft.sharedVersion,
        sharedRevisionId: draft.sharedRevisionId,
        sharedValues: projectValues(draft.sharedValues, tree.roots),
        localizedVersion: draft.localizedVersion,
        localizedRevisionId: draft.localizedRevisionId,
        localizedValues: projectValues(draft.localizedValues, tree.roots),
        canEditShared: draft.canEditShared,
        validation: AuthoringEntryValidation.make({
          valid: draft.validation.valid,
          capped: draft.validation.capped,
          issues: draft.validation.issues.map((issue) =>
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
    }),
  };
}

export class AuthoringContentRepository extends Context.Tag("AuthoringContentRepository")<
  AuthoringContentRepository,
  ReturnType<typeof makeAuthoringContentRepository>
>() {}

export const AuthoringContentRepositoryLive = Layer.succeed(
  AuthoringContentRepository,
  makeAuthoringContentRepository(),
);
