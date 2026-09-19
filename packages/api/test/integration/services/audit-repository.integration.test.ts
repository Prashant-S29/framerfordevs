// Exercises bounded project audit authorization, fixed-snapshot pagination, and self-auditing.

import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, layer } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, inArray, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import { ControlPlaneProjectAuditQuery } from "../../../src/contracts/control-plane";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../../../src/contracts/platform";
import { listProjectAuditEvents } from "../../../src/operations/audit/index";
import { AuditRepositoryLive } from "../../../src/services/audit/repository";
import { makeControlPlaneCursorSignerLive } from "../../../src/services/control-plane/cursor-signer";
import { makePlatformRepository } from "../../../src/services/platform-repository";

const suffix = randomUUID();
const ownerId = `m16-audit-owner-${suffix}`;
const restrictedDeveloperId = `m16-audit-restricted-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const platform = makePlatformRepository();
const AuditLayer = Layer.mergeAll(
  AuditRepositoryLive,
  makeControlPlaneCursorSignerLive({ activeSecret: "m16-audit-cursor-secret-32-bytes-long" }),
);
let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" && failure !== null && "_tag" in failure
    ? String(failure._tag)
    : undefined;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: ownerId,
      name: "M16 Audit Owner",
      email: `m16-audit-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: restrictedDeveloperId,
      name: "M16 Restricted Audit Developer",
      email: `m16-audit-restricted-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M16 Audit Workspace" }),
      `m16-audit-workspace-${suffix}`,
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M16 Audit Project",
        key: `m16-audit-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `m16-audit-project-${suffix}`,
    ),
  );
  const current = required(projectModel, "project");
  await db.insert(workspaceMembership).values({
    workspaceId: current.workspaceId,
    userId: restrictedDeveloperId,
    role: "collaborator",
  });
  await db.insert(projectMembership).values({
    workspaceId: current.workspaceId,
    projectId: current.id,
    userId: restrictedDeveloperId,
    role: "developer",
    localeAccessMode: "none",
    createdByUserId: ownerId,
  });
  const occurredAt = new Date(Date.now() - 10_000);
  await db.insert(auditEvent).values([
    {
      workspaceId: current.workspaceId,
      projectId: current.id,
      environmentId: current.environment.id,
      actorType: "user",
      actorId: ownerId,
      action: "cms.webhook.endpoint.disabled",
      resourceType: "webhook_endpoint",
      resourceId: randomUUID(),
      requestId: `m16-audit-event-a-${suffix}`,
      occurredAt,
    },
    {
      workspaceId: current.workspaceId,
      projectId: current.id,
      environmentId: current.environment.id,
      actorType: "credential",
      actorId: randomUUID(),
      action: "cms.webhook.endpoint.disabled",
      resourceType: "webhook_endpoint",
      resourceId: randomUUID(),
      requestId: `m16-audit-event-b-${suffix}`,
      occurredAt,
    },
  ]);
});

afterAll(async () => {
  const current = required(projectModel, "project");
  await db.delete(auditEvent).where(eq(auditEvent.projectId, current.id));
  await db
    .delete(auditEvent)
    .where(and(eq(auditEvent.workspaceId, current.workspaceId), eq(auditEvent.actorId, ownerId)));
  await db.delete(environment).where(eq(environment.projectId, current.id));
  await db.delete(projectLocale).where(eq(projectLocale.projectId, current.id));
  await db.delete(projectMembership).where(eq(projectMembership.projectId, current.id));
  await db.delete(project).where(eq(project.id, current.id));
  await db
    .delete(workspaceMembership)
    .where(
      or(
        eq(workspaceMembership.userId, ownerId),
        eq(workspaceMembership.userId, restrictedDeveloperId),
      ),
    );
  await db.delete(workspace).where(eq(workspace.id, current.workspaceId));
  await db.delete(user).where(or(eq(user.id, ownerId), eq(user.id, restrictedDeveloperId)));
  await db.$client.end();
});

describe.sequential("audit repository PostgreSQL integration", () => {
  layer(AuditLayer, { excludeTestServices: true })((it) => {
    it.effect("denies project-global audit history to a locale-restricted developer", () =>
      Effect.gen(function* () {
        const current = required(projectModel, "project");
        const denied = yield* Effect.exit(
          listProjectAuditEvents(
            restrictedDeveloperId,
            `oauth:cli:${restrictedDeveloperId}`,
            current.id,
            yield* Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
              environmentId: null,
              category: "all",
              actorKind: "all",
              actorId: null,
              action: null,
              from: new Date(Date.now() - 86_400_000).toISOString(),
              to: new Date(Date.now() + 60_000).toISOString(),
              cursor: null,
              limit: 20,
            }),
            `m16-audit-denied-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(denied), "ForbiddenFailure");
        const deniedAudit = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(eq(auditEvent.requestId, `m16-audit-denied-${suffix}`)),
        );
        assert.lengthOf(deniedAudit, 0);
      }),
    );

    it.effect("filters exact credential actors and returns a content-free projection", () =>
      Effect.gen(function* () {
        const current = required(projectModel, "project");
        const [credentialAudit] = yield* Effect.promise(() =>
          db
            .select({ actorId: auditEvent.actorId })
            .from(auditEvent)
            .where(
              and(eq(auditEvent.projectId, current.id), eq(auditEvent.actorType, "credential")),
            )
            .limit(1),
        );
        const page = yield* listProjectAuditEvents(
          ownerId,
          `oauth:cli:${ownerId}`,
          current.id,
          yield* Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
            environmentId: current.environment.id,
            category: "webhook",
            actorKind: "credential",
            actorId: required(credentialAudit, "credential audit").actorId,
            action: "cms.webhook.endpoint.disabled",
            from: new Date(Date.now() - 86_400_000).toISOString(),
            to: new Date(Date.now() + 60_000).toISOString(),
            cursor: null,
            limit: 20,
          }),
          `m16-audit-filter-${suffix}`,
        );
        assert.lengthOf(page.items, 1);
        assert.strictEqual(page.items[0]?.actor.kind, "credential");
        const serialized = JSON.stringify(page);
        assert.notInclude(serialized, `m16-audit-${suffix}@example.test`);
        assert.notInclude(serialized, "M16 Audit Owner");
        assert.notInclude(serialized, "metadata");
      }),
    );

    it.effect("uses the bounded project, environment, actor, and action timeline indexes", () =>
      Effect.gen(function* () {
        const current = required(projectModel, "project");
        const plans = yield* Effect.promise(() =>
          db.transaction(async (transaction) => {
            await transaction.execute(sql`set local enable_seqscan = off`);
            await transaction.execute(sql`set local enable_bitmapscan = off`);
            await transaction.execute(sql`set local enable_sort = off`);
            const timeline = await transaction.execute(
              sql`explain (format json) select id from audit_event where project_id = ${current.id} and occurred_at between now() - interval '31 days' and now() order by occurred_at desc, id desc limit 50`,
            );
            const environmentPlan = await transaction.execute(
              sql`explain (format json) select id from audit_event where project_id = ${current.id} and environment_id = ${current.environment.id} and occurred_at between now() - interval '31 days' and now() order by occurred_at desc, id desc limit 50`,
            );
            const actorPlan = await transaction.execute(
              sql`explain (format json) select id from audit_event where project_id = ${current.id} and actor_type = 'user' and actor_id = ${ownerId} and occurred_at between now() - interval '31 days' and now() order by occurred_at desc, id desc limit 50`,
            );
            const actionPlan = await transaction.execute(
              sql`explain (format json) select id from audit_event where project_id = ${current.id} and action = 'project.audit.read' and occurred_at between now() - interval '31 days' and now() order by occurred_at desc, id desc limit 50`,
            );
            return JSON.stringify([
              timeline.rows,
              environmentPlan.rows,
              actorPlan.rows,
              actionPlan.rows,
            ]);
          }),
        );
        assert.include(plans, "audit_event_project_occurred_id_idx");
        assert.include(plans, "audit_event_project_environment_occurred_id_idx");
        assert.include(plans, "audit_event_project_actor_occurred_id_idx");
        assert.include(plans, "audit_event_project_action_occurred_id_idx");
      }),
    );

    it.effect("paginates one fixed project window and audits every successful page", () =>
      Effect.gen(function* () {
        const current = required(projectModel, "project");
        const base = {
          environmentId: current.environment.id,
          category: "webhook" as const,
          actorKind: "all" as const,
          actorId: null,
          action: "cms.webhook.endpoint.disabled",
          from: new Date(Date.now() - 86_400_000).toISOString(),
          to: new Date(Date.now() + 60_000).toISOString(),
          limit: 1,
        };
        const first = yield* listProjectAuditEvents(
          ownerId,
          `oauth:cli:${ownerId}`,
          current.id,
          yield* Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({ ...base, cursor: null }),
          `m16-audit-read-a-${suffix}`,
        );
        assert.lengthOf(first.items, 1);
        assert.isNotNull(first.nextCursor);
        const second = yield* listProjectAuditEvents(
          ownerId,
          `oauth:cli:${ownerId}`,
          current.id,
          yield* Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
            ...base,
            cursor: first.nextCursor,
          }),
          `m16-audit-read-b-${suffix}`,
        );
        assert.lengthOf(second.items, 1);
        assert.notStrictEqual(second.items[0]?.id, first.items[0]?.id);
        assert.isNull(second.nextCursor);

        const reads = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, current.id),
                eq(auditEvent.action, "project.audit.read"),
                inArray(auditEvent.requestId, [
                  `m16-audit-read-a-${suffix}`,
                  `m16-audit-read-b-${suffix}`,
                ]),
              ),
            ),
        );
        assert.lengthOf(reads, 2);

        const firstCursor = required(first.nextCursor ?? undefined, "first audit cursor");
        const tampered = `${firstCursor.slice(0, -1)}x`;
        const exit = yield* Effect.exit(
          listProjectAuditEvents(
            ownerId,
            `oauth:cli:${ownerId}`,
            current.id,
            yield* Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
              ...base,
              cursor: tampered,
            }),
            `m16-audit-read-c-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(exit), "ControlPlaneCursorInvalidFailure");
      }),
    );
  });
});
