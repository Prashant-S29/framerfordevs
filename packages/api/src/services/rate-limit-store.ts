// Defines the replaceable rate-limit state boundary and its bounded deterministic in-memory implementation.

import { Clock, Context, Effect, Layer, Schema } from "effect";

import type {
  RateLimitEnforcementMode,
  RateLimitPolicyConfiguration,
} from "../contracts/rate-limit";

export const RateLimitStoreFailureReason = Schema.Literal(
  "connection",
  "timeout",
  "command",
  "invalid_response",
);
export type RateLimitStoreFailureReason = typeof RateLimitStoreFailureReason.Type;

export class RateLimitStoreFailure extends Schema.TaggedError<RateLimitStoreFailure>(
  "RateLimitStoreFailure",
)("RateLimitStoreFailure", {
  operation: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  reason: RateLimitStoreFailureReason,
  cause: Schema.Defect,
}) {}

export interface RateLimitStoreRequest {
  readonly key: string;
  readonly policy: RateLimitPolicyConfiguration;
  readonly cost: number;
}

export interface RateLimitStoreResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtEpochMs: number;
  readonly retryAfterSeconds: number | null;
  readonly scriptReloaded: boolean;
}

export interface RateLimitStoreService {
  readonly mode: Extract<RateLimitEnforcementMode, "redis" | "memory">;
  readonly evaluate: (
    request: RateLimitStoreRequest,
  ) => Effect.Effect<RateLimitStoreResult, RateLimitStoreFailure>;
  readonly reset: (key: string) => Effect.Effect<void, RateLimitStoreFailure>;
  readonly retainedEntryCount: Effect.Effect<number, RateLimitStoreFailure>;
}

export class RateLimitStore extends Context.Tag("RateLimitStore")<
  RateLimitStore,
  RateLimitStoreService
>() {}

export class RateLimitFallbackStore extends Context.Tag("RateLimitFallbackStore")<
  RateLimitFallbackStore,
  RateLimitStoreService
>() {}

interface MemoryRateLimitEntry {
  readonly tokens: number;
  readonly updatedAt: number;
  readonly lastSeenAt: number;
  readonly expiresAt: number;
}

export interface MemoryRateLimitStoreOptions {
  readonly maxEntries: number;
}

const defaultMemoryOptions: MemoryRateLimitStoreOptions = {
  maxEntries: 10_000,
};

/** Finds the least recently used opaque key when the bounded store reaches capacity. */
function oldestKey(entries: ReadonlyMap<string, MemoryRateLimitEntry>): string | undefined {
  let candidate: string | undefined;
  let oldestSeenAt = Number.POSITIVE_INFINITY;
  for (const [key, entry] of entries) {
    if (entry.lastSeenAt < oldestSeenAt) {
      candidate = key;
      oldestSeenAt = entry.lastSeenAt;
    }
  }
  return candidate;
}

/** Computes the bounded idle lifetime needed for a bucket to refill and then expire. */
function bucketTtlMs(policy: RateLimitPolicyConfiguration): number {
  const refillPerMs = policy.limitPerInterval / policy.intervalMs;
  return Math.ceil(policy.capacity / refillPerMs) + policy.intervalMs;
}

/** Evaluates one weighted token bucket using the supplied monotonic test/live clock value. */
function evaluateMemoryBucket(
  previous: MemoryRateLimitEntry | undefined,
  request: RateLimitStoreRequest,
  now: number,
): { readonly entry: MemoryRateLimitEntry; readonly result: RateLimitStoreResult } {
  const refillPerMs = request.policy.limitPerInterval / request.policy.intervalMs;
  const active = previous !== undefined && previous.expiresAt > now ? previous : undefined;
  const elapsed = active === undefined ? 0 : Math.max(0, now - active.updatedAt);
  const available = Math.min(
    request.policy.capacity,
    (active?.tokens ?? request.policy.capacity) + elapsed * refillPerMs,
  );
  const allowed = available >= request.cost;
  const remainingTokens = allowed ? available - request.cost : available;
  const waitForCostMs = allowed
    ? 0
    : Math.ceil(Math.max(0, request.cost - remainingTokens) / refillPerMs);
  const resetMs = Math.ceil(Math.max(0, request.policy.capacity - remainingTokens) / refillPerMs);

  return {
    entry: {
      tokens: remainingTokens,
      updatedAt: now,
      lastSeenAt: now,
      expiresAt: now + bucketTtlMs(request.policy),
    },
    result: {
      allowed,
      remaining: Math.max(0, Math.floor(remainingTokens)),
      resetAtEpochMs: now + resetMs,
      retryAfterSeconds: allowed ? null : Math.max(1, Math.ceil(waitForCostMs / 1_000)),
      scriptReloaded: false,
    },
  };
}

/** Creates a process-local store with deterministic refill, expiry, and least-recent eviction. */
export function makeMemoryRateLimitStore(
  options: MemoryRateLimitStoreOptions = defaultMemoryOptions,
): RateLimitStoreService {
  const entries = new Map<string, MemoryRateLimitEntry>();

  return {
    mode: "memory",
    evaluate: Effect.fn("MemoryRateLimitStore.evaluate")(function* (request) {
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.sync(() => {
        const current = entries.get(request.key);
        const evaluation = evaluateMemoryBucket(current, request, now);
        if (current === undefined && entries.size >= options.maxEntries) {
          const evicted = oldestKey(entries);
          if (evicted !== undefined) entries.delete(evicted);
        }
        entries.set(request.key, evaluation.entry);
        return evaluation.result;
      });
    }),
    reset: Effect.fn("MemoryRateLimitStore.reset")((key) =>
      Effect.sync(() => {
        entries.delete(key);
      }),
    ),
    retainedEntryCount: Effect.sync(() => entries.size),
  };
}

export const MemoryRateLimitStoreLive = Layer.succeed(RateLimitStore, makeMemoryRateLimitStore());

export const MemoryRateLimitFallbackStoreLive = Layer.succeed(
  RateLimitFallbackStore,
  makeMemoryRateLimitStore(),
);
