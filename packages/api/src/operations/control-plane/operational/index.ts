// Adapts shared credential lifecycle authority to the portable Control Plane projection.

import { Effect, Schema } from "effect";

import {
  ChangeApiCredentialRotationInput,
  IssueApiCredentialInput,
  RevokeApiCredentialInput,
  StartApiCredentialRotationInput,
  type ApiCredential,
  type ApiCredentialRotation,
} from "../../../contracts/access";
import {
  ControlPlaneCredential,
  type ControlPlaneCredentialListQuery,
  type ControlPlaneCredentialRotationTransitionRequest,
  type ControlPlaneIssueCredentialRequest,
  type ControlPlaneRevokeCredentialRequest,
  ControlPlaneIssuedCredential,
  type ControlPlaneStartCredentialRotationRequest,
  ControlPlaneStartedCredentialRotation,
} from "../../../contracts/control-plane";
import { UnauthorizedFailure } from "../../../contracts/response/errors";
import { AuthUserId, EnvironmentId, ProjectId } from "../../../contracts/platform";
import {
  changeApiCredentialRotation,
  issueApiCredential,
  revokeApiCredential,
  startApiCredentialRotation,
} from "../../credentials";
import { CredentialRepository } from "../../../services/credential/repository";
import { ApiCredentialId, ApiCredentialRotationId } from "../../../contracts/access";

const decode = <A, I>(schema: Schema.Schema<A, I, never>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

function credentialProjection(
  credential: ApiCredential,
  openRotation: ApiCredentialRotation | null,
) {
  return ControlPlaneCredential.make({
    id: credential.id,
    projectId: credential.projectId,
    environmentId: credential.environmentId,
    family: credential.family,
    name: credential.name,
    keyPrefix: credential.keyPrefix,
    scopes: credential.scopes,
    status: credential.status,
    version: credential.version,
    activatedAt: credential.activatedAt,
    expiresAt: credential.expiresAt,
    retireAt: credential.retireAt,
    revokedAt: credential.revokedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    openRotation,
  });
}

export const listControlPlaneCredentials = Effect.fn("control-plane.credential.list")(function* (
  actorUserId: string,
  principalKey: string,
  projectId: string,
  environmentId: string,
  query: ControlPlaneCredentialListQuery,
) {
  const actorId = yield* decode(AuthUserId, actorUserId);
  const decodedProjectId = yield* decode(ProjectId, projectId);
  const decodedEnvironmentId = yield* decode(EnvironmentId, environmentId);
  return yield* (yield* CredentialRepository).listControlPlaneCredentials(
    actorId,
    principalKey,
    decodedProjectId,
    decodedEnvironmentId,
    query,
  );
});

export const issueControlPlaneCredential = Effect.fn("control-plane.credential.issue")(function* (
  actorUserId: string,
  projectId: string,
  environmentId: string,
  request: ControlPlaneIssueCredentialRequest,
  requestId: string,
) {
  const input = yield* decode(IssueApiCredentialInput, {
    projectId,
    environmentId,
    ...request,
  });
  const issued = yield* issueApiCredential(actorUserId, input, requestId);
  return ControlPlaneIssuedCredential.make({
    credential: credentialProjection(issued.credential, null),
    key: issued.key,
  });
});

export const startControlPlaneCredentialRotation = Effect.fn(
  "control-plane.credential.rotation.start",
)(function* (
  actorUserId: string,
  projectId: string,
  environmentId: string,
  credentialId: string,
  request: ControlPlaneStartCredentialRotationRequest,
  requestId: string,
) {
  const input = yield* decode(StartApiCredentialRotationInput, {
    projectId,
    environmentId,
    credentialId: yield* decode(ApiCredentialId, credentialId),
    ...request,
  });
  const started = yield* startApiCredentialRotation(actorUserId, input, requestId);
  return ControlPlaneStartedCredentialRotation.make({
    rotation: started.rotation,
    successor: credentialProjection(started.successor, started.rotation),
    key: started.key,
  });
});

export const changeControlPlaneCredentialRotation = Effect.fn(
  "control-plane.credential.rotation.change",
)(function* (
  actorUserId: string,
  projectId: string,
  environmentId: string,
  rotationId: string,
  action: "activate" | "cancel" | "complete",
  request: ControlPlaneCredentialRotationTransitionRequest,
  requestId: string,
) {
  const input = yield* decode(ChangeApiCredentialRotationInput, {
    projectId,
    environmentId,
    rotationId: yield* decode(ApiCredentialRotationId, rotationId),
    expectedVersion: request.expectedVersion,
    action,
  });
  return yield* changeApiCredentialRotation(actorUserId, input, requestId);
});

export const revokeControlPlaneCredential = Effect.fn("control-plane.credential.revoke")(function* (
  actorUserId: string,
  projectId: string,
  environmentId: string,
  credentialId: string,
  request: ControlPlaneRevokeCredentialRequest,
  requestId: string,
) {
  const input = yield* decode(RevokeApiCredentialInput, {
    projectId,
    environmentId,
    credentialId: yield* decode(ApiCredentialId, credentialId),
    expectedVersion: request.expectedVersion,
  });
  return credentialProjection(yield* revokeApiCredential(actorUserId, input, requestId), null);
});
