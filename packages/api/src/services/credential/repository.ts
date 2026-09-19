// Persists and verifies tenant-bound credential lifecycle state with atomic audits and safe projections.

import { db } from "@framerfordevs/db";
import { and, eq, inArray, lt, or, sql } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialRotation,
  apiCredentialScope,
} from "@framerfordevs/db/schema/access";
import { auditEvent, environment } from "@framerfordevs/db/schema/platform";
import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  ApiCredential,
  ApiCredentialId,
  ApiCredentialPage,
  ApiCredentialRotation,
  ApiCredentialRotationId,
  CredentialFamily,
  type ChangeApiCredentialRotationInput,
  type CredentialLifecycleStatus,
  type IssueApiCredentialInput,
  type ListApiCredentialsInput,
  type RevokeApiCredentialInput,
  type StartApiCredentialRotationInput,
} from "../../contracts/access";
import {
  ControlPlaneCredential,
  ControlPlaneCredentialPage,
  ControlPlaneCursor,
  type ControlPlaneCredentialListQuery,
} from "../../contracts/control-plane";
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
import {
  canChangeCredentialRotation,
  canCredentialAuthenticate,
  credentialRotationRetireAt,
} from "../../lib/credential/lifecycle";
import {
  ControlPlaneCursorSigner,
  controlPlaneSearchDigest,
  type ControlPlaneCursorAuthority,
} from "../control-plane/cursor-signer";
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

/** Requires explicit consent before creating management or Delivery authority without expiry. */
function nonExpiringNotAcknowledged() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "nonExpiringAcknowledged",
        code: "non_expiring_acknowledgement_required",
        message: "Acknowledge the non-expiring credential authority before issuance.",
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
  readonly resourceType?: "api_credential" | "api_credential_rotation";
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: options.resourceType ?? "api_credential",
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

interface CredentialRowWithScopes {
  readonly credential: typeof apiCredential.$inferSelect;
  readonly scopes: ReadonlyArray<string>;
}

/** Derives the bounded read status without weakening the persisted lifecycle state. */
function credentialStatus(
  credential: typeof apiCredential.$inferSelect,
  asOf: Date,
): CredentialLifecycleStatus {
  if (
    (credential.status === "active" || credential.status === "retiring") &&
    credential.expiresAt !== null &&
    credential.expiresAt <= asOf
  ) {
    return "expired";
  }
  return credential.status as CredentialLifecycleStatus;
}

/** Projects credential rows to the public metadata contract without key digests. */
function credentialValue(value: CredentialRowWithScopes, asOf: Date) {
  return {
    id: value.credential.id,
    workspaceId: value.credential.workspaceId,
    projectId: value.credential.projectId,
    environmentId: value.credential.environmentId,
    family: value.credential.family,
    name: value.credential.name,
    keyPrefix: value.credential.keyPrefix,
    scopes: value.scopes,
    status: credentialStatus(value.credential, asOf),
    version: value.credential.version,
    activatedAt: value.credential.activatedAt ? toIso(value.credential.activatedAt) : null,
    expiresAt: value.credential.expiresAt ? toIso(value.credential.expiresAt) : null,
    retireAt: value.credential.retireAt ? toIso(value.credential.retireAt) : null,
    revokedAt: value.credential.revokedAt ? toIso(value.credential.revokedAt) : null,
    createdAt: toIso(value.credential.createdAt),
    updatedAt: toIso(value.credential.updatedAt),
  };
}

/** Projects a persisted rotation without credential secret material. */
function rotationValue(rotation: typeof apiCredentialRotation.$inferSelect) {
  return {
    id: rotation.id,
    projectId: rotation.projectId,
    environmentId: rotation.environmentId,
    predecessorCredentialId: rotation.predecessorCredentialId,
    successorCredentialId: rotation.successorCredentialId,
    status: rotation.status,
    version: rotation.version,
    activatedAt: rotation.activatedAt ? toIso(rotation.activatedAt) : null,
    retireAt: rotation.retireAt ? toIso(rotation.retireAt) : null,
    completedAt: rotation.completedAt ? toIso(rotation.completedAt) : null,
    canceledAt: rotation.canceledAt ? toIso(rotation.canceledAt) : null,
    createdAt: toIso(rotation.createdAt),
    updatedAt: toIso(rotation.updatedAt),
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
            await transaction.execute(
              sql`select id from project where id = ${input.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.issue",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (authorization.access.project.archivedAt !== null) return outcome("invalid_state");
            const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
            if (expiresAt && expiresAt <= now) return outcome("invalid_expiry");
            if (expiresAt === null && !input.nonExpiringAcknowledged) {
              return outcome("non_expiring_not_acknowledged");
            }
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
                status: "active",
                activatedAt: now,
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
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "invalid_expiry":
          return yield* invalidExpiry();
        case "invalid_preview_expiry":
          return yield* invalidPreviewExpiry();
        case "non_expiring_not_acknowledged":
          return yield* nonExpiringNotAcknowledged();
        case "preview_authority_not_acknowledged":
          return yield* previewAuthorityNotAcknowledged();
        case "success":
          return yield* decodeDatabaseValue(
            "credential.issue",
            ApiCredential,
            credentialValue(
              {
                credential: result.row,
                scopes: input.scopes,
              },
              now,
            ),
          );
      }
    }),

    listControlPlaneCredentials: Effect.fn("CredentialRepository.listControlPlaneCredentials")(
      function* (
        actorId: AuthUserId,
        principalKey: string,
        projectId: string,
        environmentId: string,
        input: ControlPlaneCredentialListQuery,
      ) {
        const signer = yield* ControlPlaneCursorSigner;
        const authority: ControlPlaneCursorAuthority = {
          route: "credentials",
          principalKey,
          workspaceId: null,
          projectId,
          environmentId,
          projectStatus: null,
          filterDigest: controlPlaneSearchDigest(
            JSON.stringify({ family: input.family, status: input.status }),
          ),
          limit: input.limit,
        };
        const position = input.cursor ? yield* signer.verify(input.cursor, authority) : null;
        const asOf = new Date(position?.asOfEpochMs ?? (yield* Clock.currentTimeMillis));
        const result = yield* Effect.tryPromise({
          try: () =>
            database.transaction(async (transaction) => {
              const authorization = await authorizeUserProject(
                transaction,
                actorId,
                projectId,
                "project.credential.read",
              );
              if (authorization.kind !== "allowed") {
                return outcomeWith(authorization.kind, {
                  rows: [],
                  scopeRows: [],
                  rotations: [],
                });
              }
              const [environmentRow] = await transaction
                .select({ id: environment.id })
                .from(environment)
                .where(
                  and(
                    eq(environment.id, environmentId),
                    eq(environment.projectId, projectId),
                    eq(environment.workspaceId, authorization.access.project.workspaceId),
                  ),
                )
                .limit(1);
              if (!environmentRow) {
                return outcomeWith("not_found", { rows: [], scopeRows: [], rotations: [] });
              }
              const statusCondition =
                input.status === "all"
                  ? undefined
                  : input.status === "expired"
                    ? and(
                        inArray(apiCredential.status, ["active", "retiring"]),
                        sql`${apiCredential.expiresAt} is not null and ${apiCredential.expiresAt} <= ${asOf}`,
                      )
                    : input.status === "active" || input.status === "retiring"
                      ? and(
                          eq(apiCredential.status, input.status),
                          or(
                            sql`${apiCredential.expiresAt} is null`,
                            sql`${apiCredential.expiresAt} > ${asOf}`,
                          ),
                        )
                      : eq(apiCredential.status, input.status);
              const cursorCondition = position
                ? or(
                    lt(apiCredential.createdAt, new Date(position.finalSortAtEpochMs)),
                    and(
                      eq(apiCredential.createdAt, new Date(position.finalSortAtEpochMs)),
                      lt(apiCredential.id, position.finalId),
                    ),
                  )
                : undefined;
              const rows = await transaction
                .select()
                .from(apiCredential)
                .where(
                  and(
                    eq(apiCredential.workspaceId, authorization.access.project.workspaceId),
                    eq(apiCredential.projectId, projectId),
                    eq(apiCredential.environmentId, environmentId),
                    input.family === "all" ? undefined : eq(apiCredential.family, input.family),
                    statusCondition,
                    cursorCondition,
                  ),
                )
                .orderBy(
                  sql`${apiCredential.createdAt} desc nulls last`,
                  sql`${apiCredential.id} desc nulls last`,
                )
                .limit(input.limit + 1);
              const visibleIds = rows.slice(0, input.limit).map((row) => row.id);
              const [scopeRows, rotations] = await Promise.all([
                selectCredentialScopes(transaction, visibleIds),
                visibleIds.length === 0
                  ? Promise.resolve([])
                  : transaction
                      .select()
                      .from(apiCredentialRotation)
                      .where(
                        and(
                          eq(
                            apiCredentialRotation.workspaceId,
                            authorization.access.project.workspaceId,
                          ),
                          eq(apiCredentialRotation.projectId, projectId),
                          eq(apiCredentialRotation.environmentId, environmentId),
                          inArray(apiCredentialRotation.status, ["pending", "overlap"]),
                          or(
                            inArray(apiCredentialRotation.predecessorCredentialId, visibleIds),
                            inArray(apiCredentialRotation.successorCredentialId, visibleIds),
                          ),
                        ),
                      ),
              ]);
              return outcomeWith("success", { rows, scopeRows, rotations });
            }),
          catch: (cause) => databaseFailure("credential.control-plane.list", cause),
        });
        if (result.kind === "not_found") {
          return yield* NotFoundFailure.make({ resource: "project" });
        }
        if (result.kind === "forbidden") return yield* ForbiddenFailure.make();

        const scopesByCredential = new Map<string, Array<string>>();
        for (const row of result.scopeRows) {
          const scopes = scopesByCredential.get(row.credentialId) ?? [];
          scopes.push(row.scope);
          scopesByCredential.set(row.credentialId, scopes);
        }
        const rotationsByCredential = new Map<string, (typeof result.rotations)[number]>();
        for (const rotation of result.rotations) {
          rotationsByCredential.set(rotation.predecessorCredentialId, rotation);
          rotationsByCredential.set(rotation.successorCredentialId, rotation);
        }
        const visible = result.rows.slice(0, input.limit);
        const items = yield* Effect.forEach(visible, (row) => {
          const rotation = rotationsByCredential.get(row.id);
          return decodeDatabaseValue("credential.control-plane.list", ControlPlaneCredential, {
            ...credentialValue(
              { credential: row, scopes: scopesByCredential.get(row.id) ?? [] },
              asOf,
            ),
            openRotation: rotation === undefined ? null : rotationValue(rotation),
          });
        });
        const last = visible.at(-1);
        const nextCursor =
          result.rows.length > input.limit && last
            ? yield* Schema.decodeUnknown(ControlPlaneCursor)(
                yield* signer.sign(authority, {
                  finalSortAtEpochMs: last.createdAt.getTime(),
                  finalId: last.id,
                  asOfEpochMs: asOf.getTime(),
                }),
              ).pipe(
                Effect.mapError((cause) =>
                  databaseFailure("credential.control-plane.cursor", cause),
                ),
              )
            : null;
        return ControlPlaneCredentialPage.make({ items, nextCursor });
      },
    ),

    listCredentials: Effect.fn("CredentialRepository.listCredentials")(function* (
      actorId: AuthUserId,
      input: ListApiCredentialsInput,
      asOf: Date,
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
          credentialValue({ credential: row, scopes: scopesByCredential.get(row.id) ?? [] }, asOf),
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

    allocateRotationId: Effect.fn("CredentialRepository.allocateRotationId")(function* () {
      const rows = yield* Effect.tryPromise({
        try: async () => {
          const result = await database.execute(sql`select uuidv7() as id`);
          return result.rows;
        },
        catch: (cause) => databaseFailure("credential.rotation.id.allocate", cause),
      });
      const first = rows[0];
      const id =
        typeof first === "object" && first !== null && "id" in first ? first.id : undefined;
      return yield* decodeDatabaseValue(
        "credential.rotation.id.allocate",
        ApiCredentialRotationId,
        id,
      );
    }),

    prepareRotationStart: Effect.fn("CredentialRepository.prepareRotationStart")(function* (
      actorId: AuthUserId,
      input: StartApiCredentialRotationInput,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeUserProject(
            database,
            actorId,
            input.projectId,
            "project.credential.rotate",
          );
          if (authorization.kind !== "allowed") return outcome(authorization.kind);
          if (authorization.access.project.archivedAt !== null) return outcome("invalid_state");
          const [credential] = await database
            .select()
            .from(apiCredential)
            .where(
              and(
                eq(apiCredential.id, input.credentialId),
                eq(apiCredential.workspaceId, authorization.access.project.workspaceId),
                eq(apiCredential.projectId, input.projectId),
                eq(apiCredential.environmentId, input.environmentId),
              ),
            )
            .limit(1);
          if (!credential) return outcome("not_found");
          if (credential.version !== input.expectedVersion) return outcome("version_conflict");
          if (
            credential.status !== "active" ||
            !canCredentialAuthenticate(credential, now) ||
            !isStoredCredentialLifetimeCompliant(credential)
          ) {
            return outcome("invalid_state");
          }
          return outcomeWith("success", { family: credential.family });
        },
        catch: (cause) => databaseFailure("credential.rotation.prepare", cause),
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
            "credential.rotation.prepare",
            CredentialFamily,
            result.family,
          );
      }
    }),

    startRotation: Effect.fn("CredentialRepository.startRotation")(function* (
      actorId: AuthUserId,
      input: StartApiCredentialRotationInput,
      rotationId: ApiCredentialRotationId,
      successorId: ApiCredentialId,
      material: CredentialMaterial,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project where id = ${input.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.rotate",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (authorization.access.project.archivedAt !== null) return outcome("invalid_state");
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

            await transaction.execute(
              sql`select id from api_credential where id = ${input.credentialId} and workspace_id = ${authorization.access.project.workspaceId} and project_id = ${input.projectId} and environment_id = ${input.environmentId} for update`,
            );
            const [current] = await transaction
              .select()
              .from(apiCredential)
              .where(
                and(
                  eq(apiCredential.id, input.credentialId),
                  eq(apiCredential.workspaceId, authorization.access.project.workspaceId),
                  eq(apiCredential.projectId, input.projectId),
                  eq(apiCredential.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!current) return outcome("not_found");
            if (current.version !== input.expectedVersion) return outcome("version_conflict");
            if (
              current.status !== "active" ||
              !canCredentialAuthenticate(current, now) ||
              !isStoredCredentialLifetimeCompliant(current)
            ) {
              return outcome("invalid_state");
            }

            const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
            if (expiresAt !== null && expiresAt <= now) return outcome("invalid_expiry");
            if (expiresAt === null && !input.nonExpiringAcknowledged) {
              return outcome("non_expiring_not_acknowledged");
            }
            if (!isCredentialIssueLifetimeCompliant(current.family, expiresAt, now)) {
              return outcome("invalid_preview_expiry");
            }
            const [openRotation] = await transaction
              .select({ id: apiCredentialRotation.id })
              .from(apiCredentialRotation)
              .where(
                and(
                  eq(apiCredentialRotation.predecessorCredentialId, current.id),
                  inArray(apiCredentialRotation.status, ["pending", "overlap"]),
                ),
              )
              .limit(1);
            if (openRotation) return outcome("rotation_conflict");

            const scopeRows = await selectCredentialScopes(transaction, [current.id]);
            const scopes = scopeRows.map((scope) => scope.scope);
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
                status: "pending",
                activatedAt: null,
                rotatedFromCredentialId: current.id,
                createdByUserId: actorId,
                expiresAt,
              })
              .returning();
            if (!successor) throw new Error("Pending credential insert returned no row.");
            await transaction.insert(apiCredentialScope).values(
              scopes.map((scope) => ({
                credentialId: successor.id,
                workspaceId: successor.workspaceId,
                projectId: successor.projectId,
                environmentId: successor.environmentId,
                scope,
              })),
            );
            const [rotation] = await transaction
              .insert(apiCredentialRotation)
              .values({
                id: rotationId,
                workspaceId: current.workspaceId,
                projectId: current.projectId,
                environmentId: current.environmentId,
                predecessorCredentialId: current.id,
                successorCredentialId: successor.id,
                createdByUserId: actorId,
                changedByUserId: actorId,
              })
              .returning();
            if (!rotation) throw new Error("Credential rotation insert returned no row.");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: rotation.workspaceId,
                projectId: rotation.projectId,
                environmentId: rotation.environmentId,
                actorId,
                action: "project.credential.rotation_started",
                resourceType: "api_credential_rotation",
                resourceId: rotation.id,
                requestId,
              }),
            );
            return outcomeWith("success", { rotation, successor, scopes });
          }),
        catch: (cause) => databaseFailure("credential.rotation.start", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "credential" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "rotation_conflict":
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "invalid_expiry":
          return yield* invalidExpiry();
        case "invalid_preview_expiry":
          return yield* invalidPreviewExpiry();
        case "non_expiring_not_acknowledged":
          return yield* nonExpiringNotAcknowledged();
        case "success": {
          const rotation = yield* decodeDatabaseValue(
            "credential.rotation.start",
            ApiCredentialRotation,
            rotationValue(result.rotation),
          );
          const successor = yield* decodeDatabaseValue(
            "credential.rotation.start",
            ApiCredential,
            credentialValue({ credential: result.successor, scopes: result.scopes }, now),
          );
          return { rotation, successor };
        }
      }
    }),

    changeRotation: Effect.fn("CredentialRepository.changeRotation")(function* (
      actorId: AuthUserId,
      input: ChangeApiCredentialRotationInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project where id = ${input.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.rotate",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (authorization.access.project.archivedAt !== null && input.action === "activate") {
              return outcome("invalid_state");
            }
            const [rotationIdentity] = await transaction
              .select({
                predecessorId: apiCredentialRotation.predecessorCredentialId,
                successorId: apiCredentialRotation.successorCredentialId,
              })
              .from(apiCredentialRotation)
              .where(
                and(
                  eq(apiCredentialRotation.id, input.rotationId),
                  eq(apiCredentialRotation.workspaceId, authorization.access.project.workspaceId),
                  eq(apiCredentialRotation.projectId, input.projectId),
                  eq(apiCredentialRotation.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!rotationIdentity) return outcome("not_found");

            await transaction.execute(
              sql`select id from api_credential where id = ${rotationIdentity.predecessorId} for update`,
            );
            await transaction.execute(
              sql`select id from api_credential_rotation where id = ${input.rotationId} for update`,
            );
            await transaction.execute(
              sql`select id from api_credential where id = ${rotationIdentity.successorId} for update`,
            );
            const [rotation] = await transaction
              .select()
              .from(apiCredentialRotation)
              .where(eq(apiCredentialRotation.id, input.rotationId))
              .limit(1);
            const [predecessor] = await transaction
              .select()
              .from(apiCredential)
              .where(eq(apiCredential.id, rotationIdentity.predecessorId))
              .limit(1);
            const [successor] = await transaction
              .select()
              .from(apiCredential)
              .where(eq(apiCredential.id, rotationIdentity.successorId))
              .limit(1);
            if (!rotation || !predecessor || !successor) return outcome("not_found");
            if (rotation.version !== input.expectedVersion) return outcome("version_conflict");
            if (!canChangeCredentialRotation(rotation.status, input.action)) {
              return outcome("invalid_state");
            }

            let updatedRotation: typeof apiCredentialRotation.$inferSelect | undefined;
            if (input.action === "activate") {
              if (
                predecessor.status !== "active" ||
                successor.status !== "pending" ||
                !canCredentialAuthenticate(predecessor, now) ||
                (successor.expiresAt !== null && successor.expiresAt <= now)
              ) {
                return outcome("invalid_state");
              }
              const retireAt = credentialRotationRetireAt(now);
              await transaction
                .update(apiCredential)
                .set({
                  status: "retiring",
                  retireAt,
                  version: sql`${apiCredential.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredential.id, predecessor.id));
              await transaction
                .update(apiCredential)
                .set({
                  status: "active",
                  activatedAt: now,
                  version: sql`${apiCredential.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredential.id, successor.id));
              [updatedRotation] = await transaction
                .update(apiCredentialRotation)
                .set({
                  status: "overlap",
                  activatedAt: now,
                  retireAt,
                  changedByUserId: actorId,
                  version: sql`${apiCredentialRotation.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredentialRotation.id, rotation.id))
                .returning();
            } else if (input.action === "cancel") {
              if (successor.status !== "pending") return outcome("invalid_state");
              await transaction
                .update(apiCredential)
                .set({
                  status: "canceled",
                  revokedAt: now,
                  revokedByUserId: actorId,
                  version: sql`${apiCredential.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredential.id, successor.id));
              [updatedRotation] = await transaction
                .update(apiCredentialRotation)
                .set({
                  status: "canceled",
                  canceledAt: now,
                  changedByUserId: actorId,
                  version: sql`${apiCredentialRotation.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredentialRotation.id, rotation.id))
                .returning();
            } else {
              if (predecessor.status !== "retiring" || successor.status !== "active") {
                return outcome("invalid_state");
              }
              await transaction
                .update(apiCredential)
                .set({
                  status: "revoked",
                  revokedAt: now,
                  revokedByUserId: actorId,
                  version: sql`${apiCredential.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredential.id, predecessor.id));
              [updatedRotation] = await transaction
                .update(apiCredentialRotation)
                .set({
                  status: "completed",
                  completedAt: now,
                  changedByUserId: actorId,
                  version: sql`${apiCredentialRotation.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(apiCredentialRotation.id, rotation.id))
                .returning();
            }
            if (!updatedRotation) throw new Error("Credential rotation update returned no row.");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: updatedRotation.workspaceId,
                projectId: updatedRotation.projectId,
                environmentId: updatedRotation.environmentId,
                actorId,
                action: `project.credential.rotation_${
                  input.action === "activate"
                    ? "activated"
                    : input.action === "cancel"
                      ? "canceled"
                      : "completed"
                }`,
                resourceType: "api_credential_rotation",
                resourceId: updatedRotation.id,
                requestId,
              }),
            );
            return outcomeWith("success", { rotation: updatedRotation });
          }),
        catch: (cause) => databaseFailure(`credential.rotation.${input.action}`, cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "credential rotation" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            `credential.rotation.${input.action}`,
            ApiCredentialRotation,
            rotationValue(result.rotation),
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
              sql`select id from project where id = ${input.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.credential.revoke",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
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

            await transaction.execute(
              sql`select id from api_credential where id = ${input.credentialId} and workspace_id = ${authorization.access.project.workspaceId} and project_id = ${input.projectId} and environment_id = ${input.environmentId} for update`,
            );
            const [current] = await transaction
              .select()
              .from(apiCredential)
              .where(
                and(
                  eq(apiCredential.id, input.credentialId),
                  eq(apiCredential.workspaceId, authorization.access.project.workspaceId),
                  eq(apiCredential.projectId, input.projectId),
                  eq(apiCredential.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!current) return outcome("not_found");
            if (current.version !== input.expectedVersion) return outcome("version_conflict");
            if (current.status !== "active") return outcome("invalid_state");

            const [openRotationIdentity] = await transaction
              .select({
                id: apiCredentialRotation.id,
                predecessorId: apiCredentialRotation.predecessorCredentialId,
                successorId: apiCredentialRotation.successorCredentialId,
                status: apiCredentialRotation.status,
              })
              .from(apiCredentialRotation)
              .where(
                and(
                  eq(apiCredentialRotation.workspaceId, current.workspaceId),
                  eq(apiCredentialRotation.projectId, current.projectId),
                  eq(apiCredentialRotation.environmentId, current.environmentId),
                  inArray(apiCredentialRotation.status, ["pending", "overlap"]),
                  or(
                    eq(apiCredentialRotation.predecessorCredentialId, current.id),
                    eq(apiCredentialRotation.successorCredentialId, current.id),
                  ),
                ),
              )
              .limit(1);
            if (
              openRotationIdentity &&
              !(
                (openRotationIdentity.status === "pending" &&
                  openRotationIdentity.predecessorId === current.id) ||
                (openRotationIdentity.status === "overlap" &&
                  openRotationIdentity.successorId === current.id)
              )
            ) {
              return outcome("invalid_state");
            }

            if (openRotationIdentity) {
              await transaction.execute(
                sql`select id from api_credential_rotation where id = ${openRotationIdentity.id} for update`,
              );
              const counterpartId =
                openRotationIdentity.predecessorId === current.id
                  ? openRotationIdentity.successorId
                  : openRotationIdentity.predecessorId;
              await transaction.execute(
                sql`select id from api_credential where id = ${counterpartId} for update`,
              );
              const [counterpart] = await transaction
                .select()
                .from(apiCredential)
                .where(eq(apiCredential.id, counterpartId))
                .limit(1);
              if (!counterpart) return outcome("not_found");
              if (openRotationIdentity.status === "pending") {
                if (counterpart.status !== "pending") return outcome("invalid_state");
                await transaction
                  .update(apiCredential)
                  .set({
                    status: "canceled",
                    revokedAt: now,
                    revokedByUserId: actorId,
                    version: sql`${apiCredential.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(apiCredential.id, counterpart.id));
                await transaction
                  .update(apiCredentialRotation)
                  .set({
                    status: "canceled",
                    canceledAt: now,
                    changedByUserId: actorId,
                    version: sql`${apiCredentialRotation.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(apiCredentialRotation.id, openRotationIdentity.id));
              } else {
                if (counterpart.status !== "retiring") return outcome("invalid_state");
                await transaction
                  .update(apiCredential)
                  .set({
                    status: "revoked",
                    revokedAt: now,
                    revokedByUserId: actorId,
                    version: sql`${apiCredential.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(apiCredential.id, counterpart.id));
                await transaction
                  .update(apiCredentialRotation)
                  .set({
                    status: "completed",
                    completedAt: now,
                    changedByUserId: actorId,
                    version: sql`${apiCredentialRotation.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(apiCredentialRotation.id, openRotationIdentity.id));
              }
            }

            const [updated] = await transaction
              .update(apiCredential)
              .set({
                status: "revoked",
                revokedAt: now,
                revokedByUserId: actorId,
                version: sql`${apiCredential.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(apiCredential.id, current.id),
                  eq(apiCredential.version, input.expectedVersion),
                  eq(apiCredential.status, "active"),
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
            credentialValue(
              {
                credential: result.updated,
                scopes: result.scopes,
              },
              now,
            ),
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
              status: apiCredential.status,
              rotatedFromCredentialId: apiCredential.rotatedFromCredentialId,
              createdByUserId: apiCredential.createdByUserId,
              activatedAt: apiCredential.activatedAt,
              expiresAt: apiCredential.expiresAt,
              retireAt: apiCredential.retireAt,
              revokedAt: apiCredential.revokedAt,
              revokedByUserId: apiCredential.revokedByUserId,
              createdAt: apiCredential.createdAt,
              updatedAt: apiCredential.updatedAt,
              scope: apiCredentialScope.scope,
            })
            .from(apiCredential)
            .leftJoin(apiCredentialScope, eq(apiCredentialScope.credentialId, apiCredential.id))
            .where(eq(apiCredential.id, sql.placeholder("credentialId")))
            .prepare("credential_verification_record_v2")
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
