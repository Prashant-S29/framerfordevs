// Coordinates closed rate-limit policies, opaque HMAC identities, shared enforcement, and bounded degraded fallback.

import { createHmac } from "node:crypto";

import { Cause, Clock, Context, Effect, Layer, Option, Schema } from "effect";

import {
  RateLimitCost,
  RateLimitDecision,
  type RateLimitEnforcementMode,
  type RateLimitPolicy,
  rateLimitPolicies,
} from "../../../contracts/rate-limit";
import { SecurityServiceFailure } from "../../../contracts/response/errors";
import { Telemetry, type TelemetryService } from "../../../observability/telemetry";
import {
  RateLimitFallbackStore,
  RateLimitStore,
  type RateLimitStoreFailure,
  type RateLimitStoreResult,
  type RateLimitStoreService,
} from "../store";

export interface EvaluateRateLimitInput {
  readonly policy: RateLimitPolicy;
  readonly identity: string;
  readonly cost: number;
}

export interface ResetRateLimitInput {
  readonly policy: RateLimitPolicy;
  readonly identity: string;
}

export interface RateLimitManagerService {
  readonly evaluate: (
    input: EvaluateRateLimitInput,
  ) => Effect.Effect<RateLimitDecision, SecurityServiceFailure>;
  readonly reset: (input: ResetRateLimitInput) => Effect.Effect<void, SecurityServiceFailure>;
  readonly retainedFallbackEntryCount: Effect.Effect<number, SecurityServiceFailure>;
}

export interface MakeRateLimitManagerOptions {
  readonly primary: RateLimitStoreService;
  readonly fallback: RateLimitStoreService;
  readonly telemetry: TelemetryService;
  readonly fingerprintSecret: string;
}

/** Converts invalid manager input or cryptographic failures into the typed infrastructure channel. */
function managerFailure(operation: string, cause: unknown): SecurityServiceFailure {
  return SecurityServiceFailure.make({ operation, cause });
}

/** Hashes each identity with policy domain separation before it can reach Redis or process memory. */
function opaqueIdentity(
  secret: string,
  policy: RateLimitPolicy,
  identity: string,
): Effect.Effect<string, SecurityServiceFailure> {
  if (identity.length < 1 || identity.length > 512) {
    return Effect.fail(
      managerFailure("rate_limit.identity.validate", new Error("Invalid rate-limit identity.")),
    );
  }
  return Effect.try({
    try: () =>
      `ffd:rate-limit:v1:${policy}:${createHmac("sha256", secret)
        .update(`ffd-rate-limit:${policy}\0${identity}`, "utf8")
        .digest("hex")}`,
    catch: (cause) => managerFailure("rate_limit.identity.hash", cause),
  });
}

/** Converts a store result into the schema-backed manager decision without exposing its key. */
function makeDecision(
  input: EvaluateRateLimitInput,
  result: RateLimitStoreResult,
  mode: RateLimitEnforcementMode,
): Effect.Effect<RateLimitDecision, SecurityServiceFailure> {
  return Schema.decodeUnknown(RateLimitDecision)({
    allowed: result.allowed,
    policy: input.policy,
    cost: input.cost,
    limit: rateLimitPolicies[input.policy].limitPerInterval,
    remaining: result.remaining,
    resetAtEpochMs: result.resetAtEpochMs,
    retryAfterSeconds: result.retryAfterSeconds,
    enforcementMode: mode,
  }).pipe(Effect.mapError((cause) => managerFailure("rate_limit.decision.decode", cause)));
}

/** Maps store failures to bounded telemetry categories without logging their foreign causes. */
function storeFailureResult(error: RateLimitStoreFailure) {
  return error.reason;
}

/** Creates the reusable manager over explicit primary/fallback implementations for live and tests. */
export function makeRateLimitManager(
  options: MakeRateLimitManagerOptions,
): RateLimitManagerService {
  let previouslyDegraded = false;

  return {
    evaluate: Effect.fn("RateLimitManager.evaluate")(function* (input) {
      const cost = yield* Schema.decodeUnknown(RateLimitCost)(input.cost).pipe(
        Effect.mapError((cause) => managerFailure("rate_limit.cost.decode", cause)),
      );
      const key = yield* opaqueIdentity(options.fingerprintSecret, input.policy, input.identity);
      const request = { key, policy: rateLimitPolicies[input.policy], cost };
      const startedAt = yield* Clock.currentTimeMillis;
      const primaryExit = yield* Effect.exit(options.primary.evaluate(request));
      const finishedAt = yield* Clock.currentTimeMillis;

      if (primaryExit._tag === "Success") {
        const storeResult = primaryExit.value.scriptReloaded ? "script_reload" : "success";
        yield* options.telemetry.recordRateLimitStore({
          result: storeResult,
          durationMs: Math.max(0, finishedAt - startedAt),
        });
        if (previouslyDegraded) {
          previouslyDegraded = false;
          yield* options.telemetry.recordRateLimitStore({ result: "recovered", durationMs: 0 });
        }
        const decision = yield* makeDecision(input, primaryExit.value, options.primary.mode);
        yield* options.telemetry.recordRateLimitDecision({
          policy: input.policy,
          enforcementMode: decision.enforcementMode,
          outcome: decision.allowed ? "allowed" : "limited",
        });
        return decision;
      }

      const primaryFailure = Option.getOrUndefined(Cause.failureOption(primaryExit.cause));
      const result =
        primaryFailure === undefined || primaryFailure._tag !== "RateLimitStoreFailure"
          ? "command"
          : storeFailureResult(primaryFailure);
      yield* options.telemetry.recordRateLimitStore({
        result,
        durationMs: Math.max(0, finishedAt - startedAt),
      });
      if (!previouslyDegraded) {
        previouslyDegraded = true;
        yield* options.telemetry.recordRateLimitStore({ result: "degraded", durationMs: 0 });
      }
      const fallback = yield* options.fallback
        .evaluate(request)
        .pipe(Effect.mapError((cause) => managerFailure("rate_limit.fallback.evaluate", cause)));
      const decision = yield* makeDecision(input, fallback, "degraded_memory");
      yield* options.telemetry.recordRateLimitDecision({
        policy: input.policy,
        enforcementMode: decision.enforcementMode,
        outcome: decision.allowed ? "allowed" : "limited",
      });
      return decision;
    }),

    reset: Effect.fn("RateLimitManager.reset")(function* (input) {
      const key = yield* opaqueIdentity(options.fingerprintSecret, input.policy, input.identity);
      yield* options.fallback
        .reset(key)
        .pipe(Effect.mapError((cause) => managerFailure("rate_limit.fallback.reset", cause)));
      yield* options.primary
        .reset(key)
        .pipe(Effect.catchTag("RateLimitStoreFailure", () => Effect.void));
    }),

    retainedFallbackEntryCount: options.fallback.retainedEntryCount.pipe(
      Effect.mapError((cause) => managerFailure("rate_limit.fallback.count", cause)),
    ),
  };
}

export class RateLimitManager extends Context.Tag("RateLimitManager")<
  RateLimitManager,
  RateLimitManagerService
>() {}

export interface RateLimitManagerLiveOptions {
  readonly fingerprintSecret: string;
}

/** Builds the manager once from the configured store services and dedicated installation secret. */
export function makeRateLimitManagerLive(options: RateLimitManagerLiveOptions) {
  return Layer.effect(
    RateLimitManager,
    Effect.gen(function* () {
      const primary = yield* RateLimitStore;
      const fallback = yield* RateLimitFallbackStore;
      const telemetry = yield* Telemetry;
      return makeRateLimitManager({
        primary,
        fallback,
        telemetry,
        fingerprintSecret: options.fingerprintSecret,
      });
    }),
  );
}
