import { Clock, Context, Effect, Either, Layer, Schema } from "effect";

import {
  CredentialPrincipal,
  type CredentialFamily,
  type CredentialScope,
} from "../contracts/access";
import { CredentialInvalidFailure, DatabaseFailure } from "../contracts/errors";
import { Telemetry } from "../observability/telemetry";
import { CredentialAttemptLimiter } from "./credential-attempt-limiter";
import { CredentialRepository } from "./credential-repository";
import { PolicyService } from "./policy";
import { SecretGenerator, parseCredentialKey } from "./secret-generator";

export interface AuthenticateCredentialInput {
  readonly key: string;
  readonly expectedFamily: CredentialFamily;
  readonly requiredScope: CredentialScope;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly source: string;
}

export function makeCredentialAuthenticator() {
  return {
    authenticate: Effect.fn("CredentialAuthenticator.authenticate")(function* (
      input: AuthenticateCredentialInput,
    ) {
      const secrets = yield* SecretGenerator;
      const limiter = yield* CredentialAttemptLimiter;
      const repository = yield* CredentialRepository;
      const policy = yield* PolicyService;
      const telemetry = yield* Telemetry;
      const attemptLimit = yield* Effect.either(limiter.assertAllowed(input.source));

      const reject = Effect.fn(function* () {
        if (Either.isLeft(attemptLimit)) {
          yield* telemetry.recordCredentialVerification({
            family: input.expectedFamily,
            outcome: "rate_limited",
          });
          return yield* attemptLimit.left;
        }
        yield* limiter.recordFailure(input.source);
        yield* telemetry.recordCredentialVerification({
          family: input.expectedFamily,
          outcome: "invalid",
        });
        return yield* CredentialInvalidFailure.make();
      });

      const parsed = parseCredentialKey(input.key);
      if (!parsed) return yield* reject();
      yield* Effect.annotateCurrentSpan({
        credentialId: parsed.id,
        family: input.expectedFamily,
        requiredScope: input.requiredScope,
      });
      const record = yield* repository.findVerificationRecord(parsed.id);
      if (!record) return yield* reject();
      const digestMatches = yield* secrets.verifyDigest(input.key, record.keyDigest);
      if (
        !digestMatches ||
        parsed.family !== record.credential.family ||
        parsed.family !== input.expectedFamily
      ) {
        return yield* reject();
      }
      const now = yield* Clock.currentTimeMillis;
      const decision = yield* policy.decideCredential({
        action: input.requiredScope,
        family: record.credential.family,
        scopes: record.scopes,
        subjectWorkspaceId: record.credential.workspaceId,
        subjectProjectId: record.credential.projectId,
        subjectEnvironmentId: record.credential.environmentId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        isActive:
          record.credential.revokedAt === null &&
          (record.credential.expiresAt === null || record.credential.expiresAt.getTime() > now),
      });
      if (!decision.allowed) return yield* reject();

      const principal = yield* Schema.decodeUnknown(CredentialPrincipal)({
        credentialId: record.credential.id,
        workspaceId: record.credential.workspaceId,
        projectId: record.credential.projectId,
        environmentId: record.credential.environmentId,
        family: record.credential.family,
        scopes: record.scopes,
      }).pipe(
        Effect.mapError((cause) =>
          DatabaseFailure.make({ operation: "credential.verify.decode", cause }),
        ),
      );
      yield* telemetry.recordCredentialVerification({
        family: input.expectedFamily,
        outcome: "success",
      });
      return principal;
    }),
  };
}

export class CredentialAuthenticator extends Context.Tag("CredentialAuthenticator")<
  CredentialAuthenticator,
  ReturnType<typeof makeCredentialAuthenticator>
>() {}

export const CredentialAuthenticatorLive = Layer.succeed(
  CredentialAuthenticator,
  makeCredentialAuthenticator(),
);
