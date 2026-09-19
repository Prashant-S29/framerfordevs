import { Clock, Effect, Schema } from "effect";

import {
  IssuedApiCredential,
  StartedApiCredentialRotation,
  type ChangeApiCredentialRotationInput,
  type IssueApiCredentialInput,
  type ListApiCredentialsInput,
  type RevokeApiCredentialInput,
  type StartApiCredentialRotationInput,
} from "../contracts/access";
import { UnauthorizedFailure } from "../contracts/response/errors";
import { AuthUserId } from "../contracts/platform";
import { CredentialRepository } from "../services/credential/repository";
import { SecretGenerator } from "../services/secret-generator";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

export const issueApiCredential = Effect.fn("credential.issue")(function* (
  actorUserId: string,
  input: IssueApiCredentialInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    family: input.family,
  });
  const repository = yield* CredentialRepository;
  const secrets = yield* SecretGenerator;
  const credentialId = yield* repository.allocateCredentialId();
  const material = yield* secrets.generateCredentialMaterial(input.family, credentialId);
  const credential = yield* repository.issueCredential(
    actorId,
    input,
    credentialId,
    material,
    yield* currentDate,
    requestId,
  );
  return IssuedApiCredential.make({ credential, key: material.key });
});

export const listApiCredentials = Effect.fn("credential.list")(function* (
  actorUserId: string,
  input: ListApiCredentialsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  const repository = yield* CredentialRepository;
  return yield* repository.listCredentials(actorId, input, yield* currentDate);
});

export const startApiCredentialRotation = Effect.fn("credential.rotation.start")(function* (
  actorUserId: string,
  input: StartApiCredentialRotationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    credentialId: input.credentialId,
  });
  const repository = yield* CredentialRepository;
  const secrets = yield* SecretGenerator;
  const now = yield* currentDate;
  const family = yield* repository.prepareRotationStart(actorId, input, now);
  const rotationId = yield* repository.allocateRotationId();
  const successorId = yield* repository.allocateCredentialId();
  const material = yield* secrets.generateCredentialMaterial(family, successorId);
  const started = yield* repository.startRotation(
    actorId,
    input,
    rotationId,
    successorId,
    material,
    now,
    requestId,
  );
  return StartedApiCredentialRotation.make({ ...started, key: material.key });
});

export const changeApiCredentialRotation = Effect.fn("credential.rotation.change")(function* (
  actorUserId: string,
  input: ChangeApiCredentialRotationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    rotationId: input.rotationId,
    action: input.action,
  });
  const repository = yield* CredentialRepository;
  return yield* repository.changeRotation(actorId, input, yield* currentDate, requestId);
});

export const revokeApiCredential = Effect.fn("credential.revoke")(function* (
  actorUserId: string,
  input: RevokeApiCredentialInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ credentialId: input.credentialId });
  const repository = yield* CredentialRepository;
  return yield* repository.revokeCredential(actorId, input, yield* currentDate, requestId);
});
