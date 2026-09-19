// Provides bounded, content-free project audit visibility with fixed-snapshot pagination.

import { db } from "@framerfordevs/db";
import { and, eq, lt, lte, or, sql } from "@framerfordevs/db/query";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  ControlPlaneCursor,
  ControlPlaneProjectAuditEvent,
  ControlPlaneProjectAuditPage,
  ProjectAuditEventId,
  type ControlPlaneProjectAuditQuery,
} from "../../contracts/control-plane";
import {
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
} from "../../contracts/response/errors";
import type { AuthUserId } from "../../contracts/platform";
import {
  ControlPlaneCursorSigner,
  controlPlaneSearchDigest,
  type ControlPlaneCursorAuthority,
} from "../control-plane/cursor-signer";
import { type ApplicationDb, authorizeUserProject } from "../project-access";

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function categoryCondition(category: ControlPlaneProjectAuditQuery["category"]) {
  if (category === "all") return undefined;
  return sql`(
    case
      when ${auditEvent.action} = 'project.audit.read' or ${auditEvent.action} like 'project.credential.%' then 'security'
      when ${auditEvent.action} like 'cms.webhook.%' or ${auditEvent.action} like 'cms.invalidation.%' then 'webhook'
      when ${auditEvent.action} in ('cms.schema.published', 'cms.entry.locale.published', 'cms.entry.locale.unpublished') then 'publication'
      when ${auditEvent.action} like 'project.membership.%' or ${auditEvent.action} like 'project.invitation.%' or ${auditEvent.action} like 'project.locale.%' or ${auditEvent.action} like 'workspace.membership.%' then 'governance'
      when ${auditEvent.action} like 'cms.schema.%' or ${auditEvent.action} like 'cms.collection.%' or ${auditEvent.action} like 'cms.editor_layout.%' then 'schema'
      when ${auditEvent.action} like 'cms.entry.%' then 'content'
      when ${auditEvent.action} like 'tooling.%' then 'tooling'
      when ${auditEvent.action} like 'project.%' or ${auditEvent.action} like 'workspace.%' or ${auditEvent.action} like 'environment.%' or ${auditEvent.action} like 'studio_registration.%' then 'project'
      else 'other'
    end
  ) = ${category}`;
}

function auditValue(row: typeof auditEvent.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    actor: { kind: row.actorType, id: row.actorId },
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    requestId: row.requestId,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function filterDigest(input: ControlPlaneProjectAuditQuery) {
  return controlPlaneSearchDigest(
    JSON.stringify({
      environmentId: input.environmentId,
      category: input.category,
      actorKind: input.actorKind,
      actorId: input.actorId,
      action: input.action,
    }),
  );
}

export function makeAuditRepository(database: ApplicationDb = db) {
  return {
    listProjectAudit: Effect.fn("AuditRepository.listProjectAudit")(function* (
      actorId: AuthUserId,
      principalKey: string,
      projectId: string,
      input: ControlPlaneProjectAuditQuery,
      requestId: string,
    ) {
      const signer = yield* ControlPlaneCursorSigner;
      const from = new Date(input.from);
      const to = new Date(input.to);
      const authority: ControlPlaneCursorAuthority = {
        route: "audit_events",
        principalKey,
        workspaceId: null,
        projectId,
        environmentId: input.environmentId,
        projectStatus: null,
        filterDigest: filterDigest(input),
        windowFromEpochMs: from.getTime(),
        windowToEpochMs: to.getTime(),
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
              "project.audit.read",
            );
            if (authorization.kind !== "allowed") {
              return { kind: authorization.kind as "not_found" | "forbidden", rows: [] };
            }
            const cursorCondition = position
              ? or(
                  lt(auditEvent.occurredAt, new Date(position.finalSortAtEpochMs)),
                  and(
                    eq(auditEvent.occurredAt, new Date(position.finalSortAtEpochMs)),
                    lt(auditEvent.id, position.finalId),
                  ),
                )
              : undefined;
            const rows = await transaction
              .select()
              .from(auditEvent)
              .where(
                and(
                  eq(auditEvent.workspaceId, authorization.access.project.workspaceId),
                  eq(auditEvent.projectId, projectId),
                  input.environmentId === null
                    ? undefined
                    : eq(auditEvent.environmentId, input.environmentId),
                  input.actorKind === "all" ? undefined : eq(auditEvent.actorType, input.actorKind),
                  input.actorId === null ? undefined : eq(auditEvent.actorId, input.actorId),
                  input.action === null ? undefined : eq(auditEvent.action, input.action),
                  categoryCondition(input.category),
                  sql`${auditEvent.occurredAt} >= ${from}`,
                  lte(auditEvent.occurredAt, to),
                  lte(auditEvent.occurredAt, asOf),
                  cursorCondition,
                ),
              )
              .orderBy(sql`${auditEvent.occurredAt} desc`, sql`${auditEvent.id} desc`)
              .limit(input.limit + 1);
            await transaction.insert(auditEvent).values({
              workspaceId: authorization.access.project.workspaceId,
              projectId,
              environmentId: input.environmentId,
              actorType: "user",
              actorId,
              action: "project.audit.read",
              resourceType: "project",
              resourceId: projectId,
              requestId,
              occurredAt: new Date(asOf.getTime() + 1),
            });
            return { kind: "success" as const, rows };
          }),
        catch: (cause) => databaseFailure("audit.project.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();

      const hasNextPage = result.rows.length > input.limit;
      const visible = result.rows.slice(0, input.limit);
      const items = yield* Effect.forEach(visible, (row) =>
        Schema.decodeUnknown(ControlPlaneProjectAuditEvent)(auditValue(row)).pipe(
          Effect.mapError((cause) => databaseFailure("audit.project.list.decode", cause)),
        ),
      );
      const last = visible.at(-1);
      const nextCursor =
        hasNextPage && last
          ? yield* Schema.decodeUnknown(ControlPlaneCursor)(
              yield* signer.sign(authority, {
                finalSortAtEpochMs: last.occurredAt.getTime(),
                finalId: yield* Schema.decodeUnknown(ProjectAuditEventId)(last.id).pipe(
                  Effect.mapError((cause) => databaseFailure("audit.project.cursor.decode", cause)),
                ),
                asOfEpochMs: asOf.getTime(),
              }),
            ).pipe(
              Effect.mapError((cause) => databaseFailure("audit.project.cursor.output", cause)),
            )
          : null;
      return ControlPlaneProjectAuditPage.make({ items, nextCursor });
    }),
  };
}

export class AuditRepository extends Context.Tag("AuditRepository")<
  AuditRepository,
  ReturnType<typeof makeAuditRepository>
>() {}

export const AuditRepositoryLive = Layer.succeed(AuditRepository, makeAuditRepository());
