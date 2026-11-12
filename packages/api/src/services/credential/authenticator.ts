import { Clock, Context, Effect, Result, Layer, Schema } from "effect";

import {
  CredentialPrincipal,
  type CredentialFamily,
  type CredentialScope,
} from "../../contracts/access";
import { CredentialInvalidFailure, DatabaseFailure } from "../../contracts/response/errors";
import { canCredentialAuthenticate } from "../../lib/credential/lifecycle";
import { Telemetry } from "../../observability/telemetry";
import { CredentialAttemptLimiter } from "./attempt-limiter";
import { isStoredCredentialLifetimeCompliant } from "./lifetime";
import { CredentialRepository } from "./repository";
import { PolicyService } from "../policy";
import { SecretGenerator, parseCredentialKey } from "../secret-generator";

export interface VerifyCredentialInput {
  readonly key: string;
  readonly expectedFamily: CredentialFamily;
  readonly requiredScope: CredentialScope;
  readonly source: string;
}

export interface AuthenticateCredentialInput extends VerifyCredentialInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
}

export function makeCredentialAuthenticator() {
  const verifyBase = Effect.fn("CredentialAuthenticator.verifyBase")(function* (
    input: VerifyCredentialInput,
    recordSuccess: boolean,
  ) {
    const secrets = yield* SecretGenerator;
    const limiter = yield* CredentialAttemptLimiter;
    const repository = yield* CredentialRepository;
    const policy = yield* PolicyService;
    const telemetry = yield* Telemetry;
    const attemptLimit = yield* Effect.result(limiter.assertAllowed(input.source));

    const reject = Effect.fn("CredentialAuthenticator.reject")(function* () {
      if (Result.isFailure(attemptLimit)) {
        yield* telemetry.recordCredentialVerification({
          family: input.expectedFamily,
          outcome: "rate_limited",
        });
        return yield* attemptLimit.failure;
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
      workspaceId: record.credential.workspaceId,
      projectId: record.credential.projectId,
      environmentId: record.credential.environmentId,
      isActive:
        canCredentialAuthenticate(record.credential, new Date(now)) &&
        isStoredCredentialLifetimeCompliant(record.credential),
    });
    if (!decision.allowed) return yield* reject();

    const principal = yield* Schema.decodeUnknownEffect(CredentialPrincipal)({
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
    if (recordSuccess) {
      yield* telemetry.recordCredentialVerification({
        family: input.expectedFamily,
        outcome: "success",
      });
    }
    return principal;
  });

  return {
    verify: Effect.fn("CredentialAuthenticator.verify")(function* (input: VerifyCredentialInput) {
      return yield* verifyBase(input, true);
    }),

    authenticate: Effect.fn("CredentialAuthenticator.authenticate")(function* (
      input: AuthenticateCredentialInput,
    ) {
      const principal = yield* verifyBase(input, false);
      const policy = yield* PolicyService;
      const limiter = yield* CredentialAttemptLimiter;
      const telemetry = yield* Telemetry;
      const decision = yield* policy.decideCredential({
        action: input.requiredScope,
        family: principal.family,
        scopes: principal.scopes,
        subjectWorkspaceId: principal.workspaceId,
        subjectProjectId: principal.projectId,
        subjectEnvironmentId: principal.environmentId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        isActive: true,
      });
      if (!decision.allowed) {
        yield* limiter.recordFailure(input.source);
        yield* telemetry.recordCredentialVerification({
          family: input.expectedFamily,
          outcome: "invalid",
        });
        return yield* CredentialInvalidFailure.make();
      }
      yield* telemetry.recordCredentialVerification({
        family: input.expectedFamily,
        outcome: "success",
      });
      return principal;
    }),
  };
}

export class CredentialAuthenticator extends Context.Service<
  CredentialAuthenticator,
  ReturnType<typeof makeCredentialAuthenticator>
>()("CredentialAuthenticator") {}

export const CredentialAuthenticatorLive = Layer.succeed(
  CredentialAuthenticator,
  makeCredentialAuthenticator(),
);
