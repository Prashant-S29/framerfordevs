// Persists one response-gating projection-integrity audit per immutable schema revision.

import { eq } from "@framerfordevs/db/query";
import { auditEvent } from "@framerfordevs/db/schema/platform";

import type {
  AuthUserId,
  EnvironmentId,
  ProjectId,
  WorkspaceId,
} from "../../../contracts/platform";
import type { SchemaRevisionId } from "../../../contracts/schema";
import {
  projectionInvalidAuditId,
  projectionInvalidAuditRequestId,
} from "../../../lib/studio-content/projection-audit";
import type { ApplicationExecutor } from "../../project-access";

export const projectionInvalidAuditAction = "cms.schema.projection_invalid_detected" as const;
export const projectionInvalidAuditResourceType = "cms_schema_revision" as const;

export interface EnsureProjectionInvalidAuditInput {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly schemaRevisionId: SchemaRevisionId;
  readonly actorId: AuthUserId;
  readonly occurredAt: Date;
}

/** Uses the existing audit primary key as the concurrent idempotency constraint. */
export async function ensureProjectionInvalidAudit(
  executor: ApplicationExecutor,
  input: EnsureProjectionInvalidAuditInput,
): Promise<{ readonly created: boolean; readonly auditId: string }> {
  const auditId = projectionInvalidAuditId(input.schemaRevisionId);
  const requestId = projectionInvalidAuditRequestId(auditId);
  const inserted = await executor
    .insert(auditEvent)
    .values({
      id: auditId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      actorType: "user",
      actorId: input.actorId,
      action: projectionInvalidAuditAction,
      resourceType: projectionInvalidAuditResourceType,
      resourceId: input.schemaRevisionId,
      requestId,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: auditEvent.id })
    .returning({ id: auditEvent.id });
  if (inserted.length === 1) return { created: true, auditId };

  const [existing] = await executor
    .select({
      workspaceId: auditEvent.workspaceId,
      projectId: auditEvent.projectId,
      environmentId: auditEvent.environmentId,
      actorType: auditEvent.actorType,
      action: auditEvent.action,
      resourceType: auditEvent.resourceType,
      resourceId: auditEvent.resourceId,
      requestId: auditEvent.requestId,
    })
    .from(auditEvent)
    .where(eq(auditEvent.id, auditId))
    .limit(1);
  if (
    existing?.workspaceId !== input.workspaceId ||
    existing.projectId !== input.projectId ||
    existing.environmentId !== input.environmentId ||
    existing.actorType !== "user" ||
    existing.action !== projectionInvalidAuditAction ||
    existing.resourceType !== projectionInvalidAuditResourceType ||
    existing.resourceId !== input.schemaRevisionId ||
    existing.requestId !== requestId
  ) {
    throw new Error("Projection-invalid audit primary-key authority did not match.");
  }
  return { created: false, auditId };
}
