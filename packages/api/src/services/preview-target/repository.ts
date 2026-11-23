import { db } from "@framerfordevs/db";
import { and, eq, sql } from "@framerfordevs/db/query";
import { environmentPreviewTarget } from "@framerfordevs/db/schema/control-plane";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  type ControlPlaneActor,
  type ControlPlaneClearPreviewTargetRequest,
  ControlPlanePreviewTargetResult,
  type ControlPlanePutPreviewTargetRequest,
  EnvironmentPreviewTarget,
} from "../../contracts/control-plane";
import type { EnvironmentId, ProjectId } from "../../contracts/platform";
import {
  ControlPlaneCommandConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  VersionConflictFailure,
} from "../../contracts/response/errors";
import {
  controlPlaneActorReferences,
  controlPlaneCommandFingerprint,
} from "../../lib/control-plane/command-fingerprint";
import { authorizeControlPlaneProject } from "../control-plane/authorization";
import {
  type ControlPlaneReceiptExpectation,
  inspectControlPlaneReceipt,
  persistControlPlaneReceipt,
} from "../control-plane/command-receipt";
import type { ApplicationDb, ApplicationExecutor, ApplicationTransaction } from "../project-access";

type PreviewTargetRow = typeof environmentPreviewTarget.$inferSelect;

export interface PreviewTargetScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
}

function targetValue(row: PreviewTargetRow): EnvironmentPreviewTarget {
  return Schema.decodeUnknownSync(EnvironmentPreviewTarget, { onExcessProperty: "error" })({
    projectId: row.projectId,
    environmentId: row.environmentId,
    previewUrl: row.previewUrl,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function selectPreviewTarget(
  executor: ApplicationExecutor,
  scope: PreviewTargetScope,
): Promise<PreviewTargetRow | undefined> {
  const [row] = await executor
    .select()
    .from(environmentPreviewTarget)
    .where(
      and(
        eq(environmentPreviewTarget.workspaceId, scope.workspaceId),
        eq(environmentPreviewTarget.projectId, scope.projectId),
        eq(environmentPreviewTarget.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  return row;
}

function audit(
  scope: PreviewTargetScope,
  actor: ControlPlaneActor,
  action: string,
  resourceId: string,
  requestId: string,
) {
  const references = controlPlaneActorReferences(actor);
  return {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    actorType: references.actorType,
    actorId: references.actorId,
    action,
    resourceType: "environment_preview_target",
    resourceId,
    requestId,
  };
}

type Mutation =
  | { readonly kind: "put"; readonly input: ControlPlanePutPreviewTargetRequest }
  | { readonly kind: "clear"; readonly input: ControlPlaneClearPreviewTargetRequest };

async function mutate(
  transaction: ApplicationTransaction,
  actor: ControlPlaneActor,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  mutation: Mutation,
  requestId: string,
) {
  const authorization = await authorizeControlPlaneProject(
    transaction,
    actor,
    projectId,
    "project.update",
    environmentId,
  );
  if (authorization.kind === "not_found") return { kind: "not_found" } as const;
  if (authorization.kind === "forbidden") return { kind: "forbidden" } as const;
  const project = authorization.access.project;
  const scope = { workspaceId: project.workspaceId, projectId, environmentId };
  const operation = mutation.kind === "put" ? "preview_target.put" : "preview_target.clear";
  const nextUrl = mutation.kind === "put" ? mutation.input.previewUrl : null;
  const expectation: ControlPlaneReceiptExpectation = {
    commandId: mutation.input.commandId,
    operation,
    actor,
    fingerprint: controlPlaneCommandFingerprint({
      operation,
      actor,
      scope,
      input: { expectedVersion: mutation.input.expectedVersion, previewUrl: nextUrl },
    }),
    ...scope,
  };
  const receipt = await inspectControlPlaneReceipt(transaction, expectation);
  if (receipt.kind === "conflict") return { kind: "command_conflict" } as const;
  if (receipt.kind === "replay") {
    const row = await selectPreviewTarget(transaction, scope);
    if (
      receipt.resourceType !== "environment_preview_target" ||
      row === undefined ||
      row.id !== receipt.resourceId
    ) {
      return { kind: "command_conflict" } as const;
    }
    return {
      kind: "success",
      row,
      created: receipt.disposition === "created",
      replayed: true,
      noOp: receipt.disposition === "no_op",
    } as const;
  }
  if (project.archivedAt !== null) return { kind: "invalid_state" } as const;

  await transaction.execute(
    sql`select id from environment_preview_target where workspace_id = ${scope.workspaceId} and project_id = ${projectId} and environment_id = ${environmentId} for update`,
  );
  const current = await selectPreviewTarget(transaction, scope);
  if (current === undefined) {
    if (mutation.kind === "clear" || mutation.input.expectedVersion !== null) {
      return { kind: "not_found" } as const;
    }
  } else if (current.version !== mutation.input.expectedVersion) {
    return { kind: "version_conflict" } as const;
  }

  const now = new Date();
  const references = controlPlaneActorReferences(actor);
  if (current === undefined) {
    const [created] = await transaction
      .insert(environmentPreviewTarget)
      .values({
        ...scope,
        previewUrl: nextUrl,
        createdByUserId: references.userId,
        createdByCredentialId: references.credentialId,
        changedByUserId: references.userId,
        changedByCredentialId: references.credentialId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Preview target insert returned no row.");
    await transaction
      .insert(auditEvent)
      .values(audit(scope, actor, "preview_target.updated", created.id, requestId));
    await persistControlPlaneReceipt(
      transaction,
      expectation,
      {
        resourceType: "environment_preview_target",
        resourceId: created.id,
        disposition: "created",
      },
      now,
    );
    return { kind: "success", row: created, created: true, replayed: false, noOp: false } as const;
  }
  if (current.previewUrl === nextUrl) {
    await persistControlPlaneReceipt(
      transaction,
      expectation,
      { resourceType: "environment_preview_target", resourceId: current.id, disposition: "no_op" },
      now,
    );
    return { kind: "success", row: current, created: false, replayed: false, noOp: true } as const;
  }
  const [updated] = await transaction
    .update(environmentPreviewTarget)
    .set({
      previewUrl: nextUrl,
      version: sql`${environmentPreviewTarget.version} + 1`,
      changedByUserId: references.userId,
      changedByCredentialId: references.credentialId,
      updatedAt: now,
    })
    .where(
      and(
        eq(environmentPreviewTarget.id, current.id),
        eq(environmentPreviewTarget.version, current.version),
      ),
    )
    .returning();
  if (!updated) return { kind: "version_conflict" } as const;
  await transaction
    .insert(auditEvent)
    .values(
      audit(
        scope,
        actor,
        nextUrl === null ? "preview_target.cleared" : "preview_target.updated",
        updated.id,
        requestId,
      ),
    );
  await persistControlPlaneReceipt(
    transaction,
    expectation,
    { resourceType: "environment_preview_target", resourceId: updated.id, disposition: "updated" },
    now,
  );
  return { kind: "success", row: updated, created: false, replayed: false, noOp: false } as const;
}

export function makePreviewTargetRepository(options: { readonly database?: ApplicationDb } = {}) {
  const database = options.database ?? db;

  const runMutation = Effect.fn("PreviewTargetRepository.mutate")(function* (
    actor: ControlPlaneActor,
    projectId: ProjectId,
    environmentId: EnvironmentId,
    mutation: Mutation,
    requestId: string,
  ) {
    const result = yield* Effect.tryPromise({
      try: () =>
        database.transaction((transaction) =>
          mutate(transaction, actor, projectId, environmentId, mutation, requestId),
        ),
      catch: (cause) => DatabaseFailure.make({ operation: "preview_target.mutate", cause }),
    });
    switch (result.kind) {
      case "not_found":
        return yield* NotFoundFailure.make({ resource: "preview_target" });
      case "forbidden":
        return yield* ForbiddenFailure.make();
      case "invalid_state":
        return yield* InvalidStateTransitionFailure.make();
      case "version_conflict":
        return yield* VersionConflictFailure.make();
      case "command_conflict":
        return yield* ControlPlaneCommandConflictFailure.make();
      case "success":
        return ControlPlanePreviewTargetResult.make({
          target: targetValue(result.row),
          created: result.created,
          replayed: result.replayed,
          noOp: result.noOp,
        });
    }
  });

  return {
    get: Effect.fn("PreviewTargetRepository.get")(function* (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      environmentId: EnvironmentId,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeControlPlaneProject(
            database,
            actor,
            projectId,
            "project.read",
            environmentId,
          );
          if (authorization.kind === "not_found") return { kind: "not_found" } as const;
          if (authorization.kind === "forbidden") return { kind: "forbidden" } as const;
          const row = await selectPreviewTarget(database, {
            workspaceId: authorization.access.project.workspaceId,
            projectId,
            environmentId,
          });
          if (row === undefined) return { kind: "not_found" } as const;
          return { kind: "success", row } as const;
        },
        catch: (cause) => DatabaseFailure.make({ operation: "preview_target.get", cause }),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "preview_target" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      return targetValue(result.row);
    }),

    put: (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      environmentId: EnvironmentId,
      input: ControlPlanePutPreviewTargetRequest,
      requestId: string,
    ) => runMutation(actor, projectId, environmentId, { kind: "put", input }, requestId),

    clear: (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      environmentId: EnvironmentId,
      input: ControlPlaneClearPreviewTargetRequest,
      requestId: string,
    ) => runMutation(actor, projectId, environmentId, { kind: "clear", input }, requestId),
  };
}

export class PreviewTargetRepository extends Context.Service<
  PreviewTargetRepository,
  ReturnType<typeof makePreviewTargetRepository>
>()("PreviewTargetRepository") {}

export const PreviewTargetRepositoryLive = Layer.succeed(
  PreviewTargetRepository,
  makePreviewTargetRepository(),
);
