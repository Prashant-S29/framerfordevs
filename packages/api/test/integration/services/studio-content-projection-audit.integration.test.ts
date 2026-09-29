import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Effect, Schema } from "effect";

import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  type Project,
  type Workspace,
} from "../../../src/contracts/platform";
import { SchemaRevisionId } from "../../../src/contracts/schema";
import {
  projectionInvalidAuditId,
  projectionInvalidAuditRequestId,
} from "../../../src/lib/studio-content/projection-audit";
import { makePlatformRepository } from "../../../src/services/platform-repository";
import {
  ensureProjectionInvalidAudit,
  projectionInvalidAuditAction,
} from "../../../src/services/studio-content/projection-audit";

const suffix = randomUUID();
const ownerId = `m19-audit-owner-${suffix}`;
const actorId = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const platform = makePlatformRepository();
let workspaceModel: Workspace | undefined;
let projectModel: Project | undefined;

function required<A>(value: A | undefined): A {
  if (value === undefined) throw new Error("Missing Studio Content audit fixture.");
  return value;
}

beforeAll(async () => {
  await db.insert(user).values({
    id: ownerId,
    name: "M19 Projection Audit Owner",
    email: `m19-projection-audit-${suffix}@example.test`,
    emailVerified: true,
  });
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      actorId,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M19 Projection Audit" }),
      `request-m19-audit-workspace-${suffix}`,
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      actorId,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel).id,
        name: "M19 Projection Audit Project",
        key: `m19-audit-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `request-m19-audit-project-${suffix}`,
    ),
  );
});

afterAll(async () => {
  if (workspaceModel !== undefined) {
    await db.delete(auditEvent).where(eq(auditEvent.workspaceId, workspaceModel.id));
  }
  if (projectModel !== undefined) {
    await db.delete(projectMembership).where(eq(projectMembership.projectId, projectModel.id));
    await db.delete(projectCapability).where(eq(projectCapability.projectId, projectModel.id));
    await db.delete(projectLocale).where(eq(projectLocale.projectId, projectModel.id));
    await db.delete(environment).where(eq(environment.projectId, projectModel.id));
    await db.delete(project).where(eq(project.id, projectModel.id));
  }
  if (workspaceModel !== undefined) {
    await db
      .delete(workspaceMembership)
      .where(eq(workspaceMembership.workspaceId, workspaceModel.id));
    await db.delete(workspace).where(eq(workspace.id, workspaceModel.id));
  }
  await db.delete(user).where(eq(user.id, ownerId));
});

function input(revisionId: typeof SchemaRevisionId.Type) {
  const currentWorkspace = required(workspaceModel);
  const currentProject = required(projectModel);
  return {
    workspaceId: currentWorkspace.id,
    projectId: currentProject.id,
    environmentId: currentProject.environment.id,
    schemaRevisionId: revisionId,
    actorId,
    occurredAt: new Date("2026-09-27T00:00:00.000Z"),
  };
}

describe("Studio Content projection-invalid audit persistence", () => {
  it("persists exactly one event across concurrent detections", async () => {
    const revisionId = Schema.decodeUnknownSync(SchemaRevisionId)(randomUUID());
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ensureProjectionInvalidAudit(db, input(revisionId))),
    );
    const rows = await db
      .select({
        id: auditEvent.id,
        workspaceId: auditEvent.workspaceId,
        projectId: auditEvent.projectId,
        environmentId: auditEvent.environmentId,
        actorType: auditEvent.actorType,
        actorId: auditEvent.actorId,
        action: auditEvent.action,
        resourceType: auditEvent.resourceType,
        resourceId: auditEvent.resourceId,
        requestId: auditEvent.requestId,
        occurredAt: auditEvent.occurredAt,
      })
      .from(auditEvent)
      .where(eq(auditEvent.id, projectionInvalidAuditId(revisionId)));

    const authority = input(revisionId);
    const auditId = projectionInvalidAuditId(revisionId);
    assert.deepStrictEqual(rows, [
      {
        id: auditId,
        workspaceId: authority.workspaceId,
        projectId: authority.projectId,
        environmentId: authority.environmentId,
        actorType: "user",
        actorId,
        action: projectionInvalidAuditAction,
        resourceType: "cms_schema_revision",
        resourceId: revisionId,
        requestId: projectionInvalidAuditRequestId(auditId),
        occurredAt: authority.occurredAt,
      },
    ]);
    assert.strictEqual(results.filter((result) => result.created).length, 1);
  });

  it("fails closed when the deterministic primary key contains mismatched authority", async () => {
    const revisionId = Schema.decodeUnknownSync(SchemaRevisionId)(randomUUID());
    const authority = input(revisionId);
    const auditId = projectionInvalidAuditId(revisionId);
    await db.insert(auditEvent).values({
      id: auditId,
      workspaceId: authority.workspaceId,
      projectId: authority.projectId,
      environmentId: authority.environmentId,
      actorType: "user",
      actorId,
      action: "cms.schema.unrelated",
      resourceType: "cms_schema_revision",
      resourceId: revisionId,
      requestId: projectionInvalidAuditRequestId(auditId),
      occurredAt: authority.occurredAt,
    });

    let message = "";
    try {
      await ensureProjectionInvalidAudit(db, authority);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert.match(message, /primary-key authority did not match/u);
  });
});
