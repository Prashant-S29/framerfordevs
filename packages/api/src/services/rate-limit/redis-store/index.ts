// Implements globally shared weighted token buckets with generic Redis protocol commands and bounded failure behavior.

import { createHash } from "node:crypto";

import { createClient } from "@redis/client";
import { Effect, Layer } from "effect";

import {
  RateLimitStore,
  RateLimitStoreFailure,
  type RateLimitStoreFailureReason,
  type RateLimitStoreRequest,
  type RateLimitStoreResult,
  type RateLimitStoreService,
} from "../store";

export const redisRateLimitScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_amount = tonumber(ARGV[2])
local interval_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])
local redis_time = redis.call('TIME')
local now = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
local bucket = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil or updated_at == nil then
  tokens = capacity
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
local refill_per_ms = refill_amount / interval_ms
tokens = math.min(capacity, tokens + elapsed * refill_per_ms)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

local retry_after_seconds = 0
if allowed == 0 then
  retry_after_seconds = math.max(1, math.ceil(((cost - tokens) / refill_per_ms) / 1000))
end
local reset_at = now + math.ceil((capacity - tokens) / refill_per_ms)

redis.call('HSET', key, 'tokens', tostring(tokens), 'updated_at', tostring(now))
redis.call('PEXPIRE', key, ttl_ms)

return {
  tostring(allowed),
  tostring(math.max(0, math.floor(tokens))),
  tostring(reset_at),
  tostring(retry_after_seconds)
}
`;

const redisRateLimitScriptDigest = createHash("sha1")
  .update(redisRateLimitScript, "utf8")
  .digest("hex");

interface RedisRateLimitClient {
  readonly evaluateSha: (
    digest: string,
    key: string,
    arguments_: ReadonlyArray<string>,
  ) => Promise<unknown>;
  readonly evaluate: (
    script: string,
    key: string,
    arguments_: ReadonlyArray<string>,
  ) => Promise<unknown>;
  readonly delete: (key: string) => Promise<unknown>;
}

export interface RedisRateLimitStoreOptions {
  readonly url: string;
  readonly timeoutMs: number;
  readonly reconnectAttempts: number;
}

/** Classifies a foreign Redis failure without placing its message in logs or public contracts. */
function failureReason(cause: unknown): RateLimitStoreFailureReason {
  if (cause instanceof DOMException && cause.name === "AbortError") return "timeout";
  if (cause instanceof Error && /abort|timeout/iu.test(cause.name)) return "timeout";
  if (cause instanceof Error && /connect|socket|closed|offline/iu.test(cause.message)) {
    return "connection";
  }
  return "command";
}

/** Wraps a foreign Redis rejection in the internal typed store error channel. */
function storeFailure(operation: string, cause: unknown): RateLimitStoreFailure {
  return RateLimitStoreFailure.make({ operation, reason: failureReason(cause), cause });
}

/** Detects only Redis' script-cache miss so arbitrary command failures are never retried. */
function isMissingScript(cause: unknown): boolean {
  return cause instanceof Error && cause.message.startsWith("NOSCRIPT");
}

/** Parses the fixed Lua reply and rejects malformed provider data before manager use. */
function decodeScriptResult(value: unknown, scriptReloaded: boolean): RateLimitStoreResult | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const values = value.map((item) =>
    typeof item === "string" || typeof item === "number" ? Number(item) : Number.NaN,
  );
  const [allowed, remaining, resetAtEpochMs, retryAfterSeconds] = values;
  if (
    allowed === undefined ||
    remaining === undefined ||
    resetAtEpochMs === undefined ||
    retryAfterSeconds === undefined ||
    !Number.isSafeInteger(allowed) ||
    (allowed !== 0 && allowed !== 1) ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    !Number.isSafeInteger(resetAtEpochMs) ||
    resetAtEpochMs < 0 ||
    !Number.isSafeInteger(retryAfterSeconds) ||
    retryAfterSeconds < 0
  ) {
    return null;
  }
  return {
    allowed: allowed === 1,
    remaining,
    resetAtEpochMs,
    retryAfterSeconds: allowed === 1 ? null : Math.max(1, retryAfterSeconds),
    scriptReloaded,
  };
}

/** Derives a bounded key lifetime from the source-controlled bucket refill profile. */
function redisBucketTtlMs(request: RateLimitStoreRequest): number {
  const refillPerMs = request.policy.limitPerInterval / request.policy.intervalMs;
  return Math.ceil(request.policy.capacity / refillPerMs) + request.policy.intervalMs;
}

/** Creates the Redis store over a minimal client port for deterministic adapter testing. */
export function makeRedisRateLimitStore(client: RedisRateLimitClient): RateLimitStoreService {
  return {
    mode: "redis",
    evaluate: Effect.fn("RedisRateLimitStore.evaluate")(function* (request) {
      const arguments_ = [
        String(request.policy.capacity),
        String(request.policy.limitPerInterval),
        String(request.policy.intervalMs),
        String(request.cost),
        String(redisBucketTtlMs(request)),
      ];
      const cached = yield* Effect.tryPromise({
        try: () => client.evaluateSha(redisRateLimitScriptDigest, request.key, arguments_),
        catch: (cause) => storeFailure("rate_limit.redis.eval_sha", cause),
      }).pipe(
        Effect.map((reply) => ({ reply, scriptReloaded: false })),
        Effect.catchTag("RateLimitStoreFailure", (error) =>
          isMissingScript(error.cause)
            ? Effect.tryPromise({
                try: () => client.evaluate(redisRateLimitScript, request.key, arguments_),
                catch: (cause) => storeFailure("rate_limit.redis.eval", cause),
              }).pipe(Effect.map((reply) => ({ reply, scriptReloaded: true })))
            : Effect.fail(error),
        ),
      );
      const decoded = decodeScriptResult(cached.reply, cached.scriptReloaded);
      if (decoded === null) {
        return yield* RateLimitStoreFailure.make({
          operation: "rate_limit.redis.decode",
          reason: "invalid_response",
          cause: new Error("Redis returned an invalid rate-limit response."),
        });
      }
      return decoded;
    }),
    reset: Effect.fn("RedisRateLimitStore.reset")(function* (key) {
      yield* Effect.tryPromise({
        try: () => client.delete(key),
        catch: (cause) => storeFailure("rate_limit.redis.delete", cause),
      });
    }),
    retainedEntryCount: Effect.succeed(0),
  };
}

/** Creates a lazy, bounded Redis client that does not make application startup depend on Redis. */
function makeRedisClient(options: RedisRateLimitStoreOptions): {
  readonly client: RedisRateLimitClient;
  readonly close: () => void;
} {
  const redis = createClient({
    url: options.url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1_000,
    socket: {
      connectTimeout: options.timeoutMs,
      socketTimeout: options.timeoutMs,
      reconnectStrategy(retries) {
        return retries >= options.reconnectAttempts ? false : Math.min(25 * 2 ** retries, 250);
      },
    },
  });
  let connection: Promise<void> | null = null;

  /** Prevents EventEmitter's special error event from terminating the process; callers observe command failures. */
  const containRedisError = () => undefined;
  redis.on("error", containRedisError);

  /** Shares one bounded connection attempt across concurrent requests. */
  const ensureConnected = async (): Promise<void> => {
    if (redis.isReady) return;
    if (connection !== null) {
      await connection;
      return;
    }
    if (redis.isOpen) return;
    const currentConnection = redis.connect().then(() => undefined);
    connection = currentConnection;
    /** Clears only the completed attempt so a newer connection cannot be overwritten. */
    const clearConnection = () => {
      if (connection === currentConnection) connection = null;
    };
    void currentConnection.then(clearConnection, clearConnection);
    await currentConnection;
  };

  /** Runs one command with an abort signal so reconnect or network stalls cannot hold a request indefinitely. */
  const withTimeout = async <A>(operation: () => Promise<A>): Promise<A> => {
    await ensureConnected();
    return operation();
  };

  return {
    client: {
      evaluateSha: (digest, key, arguments_) =>
        withTimeout(() =>
          redis
            .withAbortSignal(AbortSignal.timeout(options.timeoutMs))
            .evalSha(digest, { keys: [key], arguments: Array.from(arguments_) }),
        ),
      evaluate: (script, key, arguments_) =>
        withTimeout(() =>
          redis
            .withAbortSignal(AbortSignal.timeout(options.timeoutMs))
            .eval(script, { keys: [key], arguments: Array.from(arguments_) }),
        ),
      delete: (key) =>
        withTimeout(() => redis.withAbortSignal(AbortSignal.timeout(options.timeoutMs)).del(key)),
    },
    close: () => {
      redis.removeListener("error", containRedisError);
      if (redis.isOpen) redis.destroy();
    },
  };
}

/** Builds the scoped production store while retaining memory fallback as a separate manager dependency. */
export function makeRedisRateLimitStoreLive(options: RedisRateLimitStoreOptions) {
  return Layer.scoped(
    RateLimitStore,
    Effect.acquireRelease(
      Effect.sync(() => makeRedisClient(options)),
      (resource) => Effect.sync(resource.close),
    ).pipe(Effect.map((resource) => makeRedisRateLimitStore(resource.client))),
  );
}
