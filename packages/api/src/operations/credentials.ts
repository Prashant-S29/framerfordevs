import { Clock, Effect, Schema } from "effect";

import {
  IssuedApiCredential,
  type IssueApiCredentialInput,
  type ListApiCredentialsInput,
  type RevokeApiCredentialInput,
  type RotateApiCredentialInput,
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
  return yield* repository.listCredentials(actorId, input);
});

export const rotateApiCredential = Effect.fn("credential.rotate")(function* (
  actorUserId: string,
  input: RotateApiCredentialInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ credentialId: input.credentialId });
  const repository = yield* CredentialRepository;
  const secrets = yield* SecretGenerator;
  const now = yield* currentDate;
  const preparation = yield* repository.prepareRotation(actorId, input, now);
  const successorId = yield* repository.allocateCredentialId();
  const material = yield* secrets.generateCredentialMaterial(preparation.family, successorId);
  const credential = yield* repository.rotateCredential(
    actorId,
    input,
    preparation,
    successorId,
    material,
    now,
    requestId,
  );
  return IssuedApiCredential.make({ credential, key: material.key });
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
