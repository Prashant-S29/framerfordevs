// Persists and verifies tenant-bound credential lifecycle state with atomic audits and safe projections.

import { db } from "@framerfordevs/db";
import { and, eq, inArray, isNull, lt, or, sql } from "@framerfordevs/db/query";
import { apiCredential, apiCredentialScope } from "@framerfordevs/db/schema/access";
import { auditEvent, environment } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  ApiCredential,
  ApiCredentialId,
  ApiCredentialPage,
  CredentialFamily,
  CredentialScopes,
  type CredentialFamily as CredentialFamilyType,
  type IssueApiCredentialInput,
  type ListApiCredentialsInput,
  type RevokeApiCredentialInput,
  type RotateApiCredentialInput,
} from "../../contracts/access";
import {
  decodeApiCredentialCursor,
  encodeApiCredentialCursor,
} from "../../contracts/access/page-cursor";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  ValidationFailure,
  VersionConflictFailure,
} from "../../contracts/response/errors";
import type { AuthUserId } from "../../contracts/platform";
import type { CredentialMaterial } from "../secret-generator";
import {
  isCredentialIssueLifetimeCompliant,
  isStoredCredentialLifetimeCompliant,
} from "./lifetime";
import { areScopesAllowedForFamily, isRoleAllowed } from "../policy";
import { type ApplicationDb, authorizeUserProject } from "../project-access";

/** Creates a discriminated repository outcome without attaching mutable state. */
function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

/** Creates a discriminated repository outcome with its bounded result projection. */
function outcomeWith<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

/** Translates foreign database failures into the shared redacted infrastructure error. */
function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

/** Decodes persisted values before they can enter credential domain workflows. */
function decodeDatabaseValue<A, I>(
  operation: string,
  schema: Schema.Schema<A, I, never>,
  value: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) => databaseFailure(`${operation}.decode`, cause)),
  );
}

/** Encodes database timestamps in the canonical application instant representation. */
function toIso(value: Date): string {
  return value.toISOString();
}

/** Returns the bounded validation failure for family-incompatible credential scopes. */
function invalidScopes() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "scopes",
        code: "incompatible_scopes",
        message: "Select only scopes supported by this credential family and your role.",
      }),
    ],
  });
}

/** Returns the existing generic invalid-expiry failure for non-Preview credentials. */
function invalidExpiry() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "expiresAt",
        code: "invalid_expiry",
        message: "Credential expiry must be in the future.",
      }),
    ],
  });
}

/** Returns the approved expiring-only maximum-lifetime failure for Preview credentials. */
function invalidPreviewExpiry() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "expiresAt",
        code: "preview_expiry_invalid",
        message: "Preview credentials require a future expiry no more than 30 days from issuance.",
      }),
    ],
  });
}

/** Requires explicit consent to environment-wide unpublished and hidden-field Preview authority. */
function previewAuthorityNotAcknowledged() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "previewAuthorityAcknowledged",
        code: "preview_authority_acknowledgement_required",
        message: "Acknowledge the complete environment-wide Preview authority before issuance.",
      }),
    ],
  });
}

/** Constructs content-free immutable credential lifecycle audit values. */
function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: "api_credential",
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

interface CredentialRowWithScopes {
  readonly credential: typeof apiCredential.$inferSelect;
  readonly scopes: ReadonlyArray<string>;
}

/** Projects credential rows to the public metadata contract without key digests. */
function credentialValue(value: CredentialRowWithScopes) {
  return {
    id: value.credential.id,
    workspaceId: value.credential.workspaceId,
    projectId: value.credential.projectId,
    environmentId: value.credential.environmentId,
    family: value.credential.family,
    name: value.credential.name,
    keyPrefix: value.credential.keyPrefix,
    scopes: value.scopes,
    version: value.credential.version,
    expiresAt: value.credential.expiresAt ? toIso(value.credential.expiresAt) : null,
    revokedAt: value.credential.revokedAt ? toIso(value.credential.revokedAt) : null,
    createdAt: toIso(value.credential.createdAt),
    updatedAt: toIso(value.credential.updatedAt),
  };
}

/** Loads normalized scope rows for a bounded set of credential identities. */
async function selectCredentialScopes(
  executor: ApplicationDb | Parameters<Parameters<ApplicationDb["transaction"]>[0]>[0],
  credentialIds: ReadonlyArray<string>,
) {
  if (credentialIds.length === 0) return [];
  return executor
    .select()
    .from(apiCredentialScope)
    .where(inArray(apiCredentialScope.credentialId, credentialIds));
}

export interface CredentialVerificationRecord extends CredentialRowWithScopes {
  readonly keyDigest: string;
}

export interface RotationPreparation {
  readonly credential: typeof apiCredential.$inferSelect;
  readonly scopes: typeof CredentialScopes.Type;
  readonly family: CredentialFamilyType;
}

interface RepositoryOptions {
  readonly database?: ApplicationDb;
}

/** Creates the credential repository over the shared database or an explicit test database. */
export function makeCredentialRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    allocateCredentialId: Effect.fn("CredentialRepository.allocateCredentialId")(function* () {
      const rows = yield* Effect.tryPromise({
        try: async () => {
          const result = await database.execute(sql`select uuidv7() as id`);
          return result.rows;
        },
        catch: (cause) => databaseFailure("credential.id.allocate", cause),
      });
      const first = rows[0];
      const id =
        typeof first === "object" && first !== null && "id" in first ? first.id : undefined;
      return yield* decodeDatabaseValue("credential.id.allocate", ApiCredentialId, id);
    }),

    issueCredential: Effect.fn("CredentialRepository.issueCredential")(function* (
      actorId: AuthUserId,
      input: IssueApiCredentialInput,
      credentialId: ApiCredentialId,
      material: CredentialMaterial,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.issue",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
            if (expiresAt && expiresAt <= now) return outcome("invalid_expiry");
            if (!isCredentialIssueLifetimeCompliant(input.family, expiresAt, now)) {
              return outcome("invalid_preview_expiry");
            }
            if (input.family === "preview" && !input.previewAuthorityAcknowledged) {
              return outcome("preview_authority_not_acknowledged");
            }
            if (!areScopesAllowedForFamily(input.family, input.scopes)) {
              return outcome("invalid_scopes");
            }
            if (
              input.family === "management" &&
              !input.scopes.every((scope) => isRoleAllowed(authorization.access.role, scope))
            ) {
              return outcome("forbidden");
            }
            const [environmentRow] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.id, input.environmentId),
                  eq(environment.projectId, input.projectId),
                  eq(environment.workspaceId, authorization.access.project.workspaceId),
                ),
              )
              .limit(1);
            if (!environmentRow) return outcome("not_found");

            const [row] = await transaction
              .insert(apiCredential)
              .values({
                id: credentialId,
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                family: input.family,
                name: input.name,
                keyPrefix: material.keyPrefix,
                keyDigest: material.keyDigest,
                createdByUserId: actorId,
                expiresAt,
              })
              .returning();
            if (!row) throw new Error("Credential insert returned no row.");
            await transaction.insert(apiCredentialScope).values(
              input.scopes.map((scope) => ({
                credentialId: row.id,
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                environmentId: row.environmentId,
                scope,
              })),
            );
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                environmentId: row.environmentId,
                actorId,
                action: "project.credential.issued",
                resourceId: row.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("credential.issue", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "invalid_scopes":
          return yield* invalidScopes();
        case "invalid_expiry":
          return yield* invalidExpiry();
        case "invalid_preview_expiry":
          return yield* invalidPreviewExpiry();
        case "preview_authority_not_acknowledged":
          return yield* previewAuthorityNotAcknowledged();
        case "success":
          return yield* decodeDatabaseValue(
            "credential.issue",
            ApiCredential,
            credentialValue({
              credential: result.row,
              scopes: input.scopes,
            }),
          );
      }
    }),

    listCredentials: Effect.fn("CredentialRepository.listCredentials")(function* (
      actorId: AuthUserId,
      input: ListApiCredentialsInput,
    ) {
      const cursor = input.cursor
        ? yield* decodeApiCredentialCursor(input.cursor, input.projectId, input.environmentId)
        : null;
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.read",
            );
            if (authorization.kind !== "allowed") {
              return outcomeWith(authorization.kind, { rows: [], scopeRows: [] });
            }
            const [environmentRow] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.id, input.environmentId),
                  eq(environment.projectId, input.projectId),
                  eq(environment.workspaceId, authorization.access.project.workspaceId),
                ),
              )
              .limit(1);
            if (!environmentRow) return outcomeWith("not_found", { rows: [], scopeRows: [] });
            const cursorCondition = cursor
              ? or(
                  lt(apiCredential.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(apiCredential.createdAt, new Date(cursor.createdAt)),
                    lt(apiCredential.id, cursor.credentialId),
                  ),
                )
              : undefined;
            const rows = await transaction
              .select()
              .from(apiCredential)
              .where(
                and(
                  eq(apiCredential.projectId, input.projectId),
                  eq(apiCredential.environmentId, input.environmentId),
                  cursorCondition,
                ),
              )
              .orderBy(
                sql`${apiCredential.createdAt} desc nulls last`,
                sql`${apiCredential.id} desc nulls last`,
              )
              .limit(input.limit + 1);
            const scopeRows = await selectCredentialScopes(
              transaction,
              rows.slice(0, input.limit).map((row) => row.id),
            );
            return outcomeWith("success", { rows, scopeRows });
          }),
        catch: (cause) => databaseFailure("credential.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();

      const hasNextPage = result.rows.length > input.limit;
      const visible = result.rows.slice(0, input.limit);
      const scopesByCredential = new Map<string, Array<string>>();
      for (const row of result.scopeRows) {
        const scopes = scopesByCredential.get(row.credentialId) ?? [];
        scopes.push(row.scope);
        scopesByCredential.set(row.credentialId, scopes);
      }
      const items = yield* Effect.forEach(visible, (row) =>
        decodeDatabaseValue(
          "credential.list",
          ApiCredential,
          credentialValue({ credential: row, scopes: scopesByCredential.get(row.id) ?? [] }),
        ),
      );
      const last = visible.at(-1);
      const nextCursor =
        hasNextPage && last
          ? yield* encodeApiCredentialCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              createdAt: toIso(last.createdAt),
              credentialId: yield* decodeDatabaseValue("credential.list", ApiCredentialId, last.id),
            })
          : null;
      return ApiCredentialPage.make({ items, nextCursor });
    }),

    prepareRotation: Effect.fn("CredentialRepository.prepareRotation")(function* (
      actorId: AuthUserId,
      input: RotateApiCredentialInput,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [row] = await transaction
              .select()
              .from(apiCredential)
              .where(eq(apiCredential.id, input.credentialId))
              .limit(1);
            if (!row) return outcome("not_found");
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              row.projectId,
              "project.credential.rotate",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (row.version !== input.version) return outcome("version_conflict");
            if (
              row.revokedAt ||
              (row.expiresAt && row.expiresAt <= now) ||
              !isStoredCredentialLifetimeCompliant(row)
            )
              return outcome("invalid_state");
            const scopes = await selectCredentialScopes(transaction, [row.id]);
            return outcomeWith("success", { row, scopes: scopes.map((scope) => scope.scope) });
          }),
        catch: (cause) => databaseFailure("credential.rotate.prepare", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "credential" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "success": {
          const scopes = yield* decodeDatabaseValue(
            "credential.rotate.prepare",
            CredentialScopes,
            result.scopes,
          );
          const family = yield* decodeDatabaseValue(
            "credential.rotate.prepare",
            CredentialFamily,
            result.row.family,
          );
          return { credential: result.row, scopes, family };
        }
      }
    }),

    rotateCredential: Effect.fn("CredentialRepository.rotateCredential")(function* (
      actorId: AuthUserId,
      input: RotateApiCredentialInput,
      preparation: RotationPreparation,
      successorId: ApiCredentialId,
      material: CredentialMaterial,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from api_credential where id = ${input.credentialId} for update`,
            );
            const [current] = await transaction
              .select()
              .from(apiCredential)
              .where(eq(apiCredential.id, input.credentialId))
              .limit(1);
            if (!current) return outcome("not_found");
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              current.projectId,
              "project.credential.rotate",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (current.version !== input.version) return outcome("version_conflict");
            if (
              current.revokedAt ||
              (current.expiresAt && current.expiresAt <= now) ||
              !isStoredCredentialLifetimeCompliant(current)
            ) {
              return outcome("invalid_state");
            }
            if (
              current.id !== preparation.credential.id ||
              current.family !== preparation.credential.family ||
              current.projectId !== preparation.credential.projectId ||
              current.environmentId !== preparation.credential.environmentId
            ) {
              return outcome("version_conflict");
            }
            const currentScopes = await selectCredentialScopes(transaction, [current.id]);
            const scopes = currentScopes.map((scope) => scope.scope);
            if (!areScopesAllowedForFamily(current.family, scopes)) return outcome("invalid_state");

            const [successor] = await transaction
              .insert(apiCredential)
              .values({
                id: successorId,
                workspaceId: current.workspaceId,
                projectId: current.projectId,
                environmentId: current.environmentId,
                family: current.family,
                name: current.name,
                keyPrefix: material.keyPrefix,
                keyDigest: material.keyDigest,
                rotatedFromCredentialId: current.id,
                createdByUserId: actorId,
                expiresAt: current.expiresAt,
              })
              .returning();
            if (!successor) throw new Error("Rotated credential insert returned no row.");
            await transaction.insert(apiCredentialScope).values(
              scopes.map((scope) => ({
                credentialId: successor.id,
                workspaceId: successor.workspaceId,
                projectId: successor.projectId,
                environmentId: successor.environmentId,
                scope,
              })),
            );
            const [revoked] = await transaction
              .update(apiCredential)
              .set({
                revokedAt: now,
                revokedByUserId: actorId,
                version: sql`${apiCredential.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(apiCredential.id, current.id),
                  eq(apiCredential.version, input.version),
                  isNull(apiCredential.revokedAt),
                ),
              )
              .returning({ id: apiCredential.id });
            if (!revoked) return outcome("version_conflict");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: successor.workspaceId,
                projectId: successor.projectId,
                environmentId: successor.environmentId,
                actorId,
                action: "project.credential.rotated",
                resourceId: successor.id,
                requestId,
              }),
            );
            return outcomeWith("success", { successor, scopes });
          }),
        catch: (cause) => databaseFailure("credential.rotate", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "credential" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "credential.rotate",
            ApiCredential,
            credentialValue({
              credential: result.successor,
              scopes: result.scopes,
            }),
          );
      }
    }),

    revokeCredential: Effect.fn("CredentialRepository.revokeCredential")(function* (
      actorId: AuthUserId,
      input: RevokeApiCredentialInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from api_credential where id = ${input.credentialId} for update`,
            );
            const [current] = await transaction
              .select()
              .from(apiCredential)
              .where(eq(apiCredential.id, input.credentialId))
              .limit(1);
            if (!current) return outcome("not_found");
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              current.projectId,
              "project.credential.revoke",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (current.version !== input.version) return outcome("version_conflict");
            if (current.revokedAt) return outcome("invalid_state");
            const [updated] = await transaction
              .update(apiCredential)
              .set({
                revokedAt: now,
                revokedByUserId: actorId,
                version: sql`${apiCredential.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(apiCredential.id, current.id),
                  eq(apiCredential.version, input.version),
                  isNull(apiCredential.revokedAt),
                ),
              )
              .returning();
            if (!updated) return outcome("version_conflict");
            const scopes = await selectCredentialScopes(transaction, [updated.id]);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: updated.workspaceId,
                projectId: updated.projectId,
                environmentId: updated.environmentId,
                actorId,
                action: "project.credential.revoked",
                resourceId: updated.id,
                requestId,
              }),
            );
            return outcomeWith("success", {
              updated,
              scopes: scopes.map((scope) => scope.scope),
            });
          }),
        catch: (cause) => databaseFailure("credential.revoke", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "credential" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "credential.revoke",
            ApiCredential,
            credentialValue({
              credential: result.updated,
              scopes: result.scopes,
            }),
          );
      }
    }),

    findVerificationRecord: Effect.fn("CredentialRepository.findVerificationRecord")(function* (
      credentialId: ApiCredentialId,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const rows = await database
            .select({
              id: apiCredential.id,
              workspaceId: apiCredential.workspaceId,
              projectId: apiCredential.projectId,
              environmentId: apiCredential.environmentId,
              family: apiCredential.family,
              name: apiCredential.name,
              keyPrefix: apiCredential.keyPrefix,
              keyDigest: apiCredential.keyDigest,
              version: apiCredential.version,
              rotatedFromCredentialId: apiCredential.rotatedFromCredentialId,
              createdByUserId: apiCredential.createdByUserId,
              expiresAt: apiCredential.expiresAt,
              revokedAt: apiCredential.revokedAt,
              revokedByUserId: apiCredential.revokedByUserId,
              createdAt: apiCredential.createdAt,
              updatedAt: apiCredential.updatedAt,
              scope: apiCredentialScope.scope,
            })
            .from(apiCredential)
            .leftJoin(apiCredentialScope, eq(apiCredentialScope.credentialId, apiCredential.id))
            .where(eq(apiCredential.id, sql.placeholder("credentialId")))
            .prepare("credential_verification_record_v1")
            .execute({ credentialId });
          const first = rows[0];
          if (first === undefined) return undefined;
          const { scope: _scope, ...credential } = first;
          return {
            credential,
            keyDigest: credential.keyDigest,
            scopes: rows.flatMap((row) => (row.scope === null ? [] : [row.scope])),
          };
        },
        catch: (cause) => databaseFailure("credential.verify.lookup", cause),
      });
      return result;
    }),
  };
}

export class CredentialRepository extends Context.Tag("CredentialRepository")<
  CredentialRepository,
  ReturnType<typeof makeCredentialRepository>
>() {}

export const CredentialRepositoryLive = Layer.succeed(
  CredentialRepository,
  makeCredentialRepository(),
);
