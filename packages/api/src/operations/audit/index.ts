// Exposes user-only bounded project audit visibility over the shared repository authority.

import { Effect } from "effect";

import type { ControlPlaneProjectAuditQuery } from "../../contracts/control-plane";
import { AuthUserId, ProjectId } from "../../contracts/platform";
import { UnauthorizedFailure } from "../../contracts/response/errors";
import { AuditRepository } from "../../services/audit/repository";

import * as SchemaStrict from "../../lib/schema-strict";
export const listProjectAuditEvents = Effect.fn("audit.project.list")(function* (
  actorUserId: string,
  principalKey: string,
  projectId: string,
  input: ControlPlaneProjectAuditQuery,
  requestId: string,
) {
  const actorId = yield* SchemaStrict.decodeUnknownEffect(AuthUserId)(actorUserId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );
  const decodedProjectId = yield* SchemaStrict.decodeUnknownEffect(ProjectId)(projectId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );
  yield* Effect.annotateCurrentSpan({ projectId: decodedProjectId });
  return yield* (yield* AuditRepository).listProjectAudit(
    actorId,
    principalKey,
    decodedProjectId,
    input,
    requestId,
  );
});
