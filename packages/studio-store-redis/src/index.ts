// Redis-backed encrypted Studio store with atomic quotas, one-shot attempts, and pre-dispatch refresh fencing.

import { createClient } from "@redis/client";
import { Effect } from "effect";

import {
  StudioStoreFailure,
  type AdmissionResult,
  type CreateAttemptInput,
  type CreateSessionInput,
  type RefreshClaimResult,
  type StudioAttemptRecord,
  type StudioCiphertext,
  type StudioRateLimitInput,
  type StudioSessionRecord,
  type StudioSessionStore,
} from "@framerfordevs/studio-server/store";

interface RedisPort {
  readonly eval: (
    script: string,
    keys: ReadonlyArray<string>,
    arguments_: ReadonlyArray<string>,
  ) => Promise<unknown>;
  readonly close: () => void;
}

export interface RedisStudioStoreOptions {
  readonly url: string;
  /** Operator assertion that Redis persistence/replication survives application process restarts. */
  readonly durability: "restart-stable";
  readonly timeoutMs?: number;
  readonly reconnectAttempts?: number;
  /** Stable deployment namespace epoch; rotate it after restoring an older Redis snapshot. */
  readonly namespace: string;
}

const createScript = `
local key = KEYS[1]
local index = KEYS[2]
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local expired = redis.call('ZRANGEBYSCORE', index, '-inf', now, 'LIMIT', 0, 100)
if #expired > 0 then redis.call('ZREM', index, unpack(expired)) end
if redis.call('EXISTS', key) == 1 then return 'exists' end
if redis.call('ZCARD', index) >= maximum then return 'quota_exceeded' end
redis.call('HSET', key, unpack(ARGV, 5))
redis.call('PEXPIREAT', key, expires)
redis.call('ZADD', index, expires, ARGV[4])
local index_ttl = redis.call('PTTL', index)
if index_ttl < 0 then redis.call('PEXPIREAT', index, expires) else redis.call('PEXPIREAT', index, expires, 'GT') end
return 'created'
`;

const replaceSessionScript = `
local old_key = KEYS[1]
local new_key = KEYS[2]
local index = KEYS[3]
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local registration = ARGV[7]
local expired = redis.call('ZRANGEBYSCORE', index, '-inf', now, 'LIMIT', 0, 100)
if #expired > 0 then redis.call('ZREM', index, unpack(expired)) end
if redis.call('EXISTS', new_key) == 1 then return 'exists' end
if redis.call('HGET', old_key, 'registration') == registration then
  redis.call('DEL', old_key)
  redis.call('ZREM', index, ARGV[4])
end
if redis.call('ZCARD', index) >= maximum then return 'quota_exceeded' end
redis.call('HSET', new_key, unpack(ARGV, 6))
redis.call('PEXPIREAT', new_key, expires)
redis.call('ZADD', index, expires, ARGV[5])
local index_ttl = redis.call('PTTL', index)
if index_ttl < 0 then redis.call('PEXPIREAT', index, expires) else redis.call('PEXPIREAT', index, expires, 'GT') end
return 'created'
`;

const attemptReadScript = `
local key = KEYS[1]
local index = KEYS[2]
local registration = ARGV[1]
local now = tonumber(ARGV[2])
local consume = ARGV[3]
local values = redis.call('HMGET', key, 'registration', 'expires', 'envelope')
if not values[1] or values[1] ~= registration or tonumber(values[2]) <= now then
  if values[1] and tonumber(values[2]) <= now then redis.call('DEL', key); redis.call('ZREM', index, ARGV[4]) end
  return {}
end
if consume == '1' then redis.call('DEL', key); redis.call('ZREM', index, ARGV[4]) end
return values
`;

const sessionReadScript = `
local key = KEYS[1]
local index = KEYS[2]
local registration = ARGV[1]
local now = tonumber(ARGV[2])
local values = redis.call('HMGET', key, 'registration', 'expires', 'generation', 'owner', 'dispatched', 'lease', 'envelope')
if not values[1] or values[1] ~= registration or tonumber(values[2]) <= now then
  if values[1] and tonumber(values[2]) <= now then redis.call('DEL', key); redis.call('ZREM', index, ARGV[3]) end
  return {}
end
return values
`;

const reencryptScript = `
local key = KEYS[1]
local values = redis.call('HMGET', key, 'registration', 'generation', 'owner')
if not values[1] or values[1] ~= ARGV[1] or values[2] ~= ARGV[2] or (values[3] and values[3] ~= '') then return 0 end
redis.call('HSET', key, 'envelope', ARGV[3])
return 1
`;

const claimScript = `
local key = KEYS[1]
local registration = ARGV[1]
local generation = ARGV[2]
local owner = ARGV[3]
local now = tonumber(ARGV[4])
local values = redis.call('HMGET', key, 'registration', 'expires', 'generation', 'owner', 'dispatched', 'lease', 'envelope')
if not values[1] or values[1] ~= registration or tonumber(values[2]) <= now or values[3] ~= generation then return {'missing'} end
if values[4] and values[4] ~= '' then
  if (tonumber(values[6]) or 0) > now then return {'busy', values[3]} end
  if values[5] == '1' then return {'terminal'} end
end
redis.call('HSET', key, 'owner', owner, 'dispatched', '0', 'lease', ARGV[5])
return {'claimed', unpack(values)}
`;

const ownerTransitionScript = `
local key = KEYS[1]
local registration = ARGV[1]
local generation = ARGV[2]
local owner = ARGV[3]
local operation = ARGV[4]
local values = redis.call('HMGET', key, 'registration', 'generation', 'owner', 'dispatched')
if not values[1] or values[1] ~= registration or values[2] ~= generation or values[3] ~= owner then return 0 end
if operation == 'dispatch' and values[4] == '0' then redis.call('HSET', key, 'dispatched', '1'); return 1 end
if operation == 'release' and values[4] == '0' then redis.call('HSET', key, 'owner', '', 'dispatched', '0', 'lease', '0'); return 1 end
return 0
`;

const commitScript = `
local key = KEYS[1]
local index = KEYS[2]
local expected = ARGV[1]
local owner = ARGV[2]
local values = redis.call('HMGET', key, 'registration', 'generation', 'owner', 'dispatched')
if not values[1] or values[1] ~= ARGV[3] or values[2] ~= expected or values[3] ~= owner or values[4] ~= '1' then return 0 end
redis.call('HSET', key,
  'registration', ARGV[3], 'expires', ARGV[4], 'generation', ARGV[5],
  'owner', '', 'dispatched', '0', 'lease', '0', 'envelope', ARGV[6])
redis.call('PEXPIREAT', key, tonumber(ARGV[4]))
redis.call('ZADD', index, tonumber(ARGV[4]), ARGV[7])
local index_ttl = redis.call('PTTL', index)
if index_ttl < 0 then redis.call('PEXPIREAT', index, tonumber(ARGV[4])) else redis.call('PEXPIREAT', index, tonumber(ARGV[4]), 'GT') end
return 1
`;

const deleteScript = `
local key = KEYS[1]
local index = KEYS[2]
if redis.call('HGET', key, 'registration') == ARGV[1] then
  redis.call('DEL', key); redis.call('ZREM', index, ARGV[2])
end
return 1
`;

const permitAcquireScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local owner = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZSCORE', key, owner) then return 0 end
if redis.call('ZCARD', key) >= maximum then return 0 end
redis.call('ZADD', key, expires, owner)
local key_ttl = redis.call('PTTL', key)
if key_ttl < 0 then redis.call('PEXPIREAT', key, expires) else redis.call('PEXPIREAT', key, expires, 'GT') end
return 1
`;

const permitReleaseScript = `
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;

const rateLimitScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local interval = tonumber(ARGV[3])
local values = redis.call('HMGET', key, 'tokens', 'updated')
local tokens = tonumber(values[1]) or capacity
local updated = tonumber(values[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updated) * capacity / interval)
local allowed = 0
if tokens >= 1 then allowed = 1; tokens = tokens - 1 end
local retry = 0
if allowed == 0 then retry = math.max(1, math.ceil((1 - tokens) * interval / capacity / 1000)) end
redis.call('HSET', key, 'tokens', tostring(tokens), 'updated', tostring(now))
redis.call('PEXPIRE', key, interval * 2)
return {tostring(allowed), tostring(retry)}
`;

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "number") return String(value);
  return null;
}
function array(value: unknown): ReadonlyArray<unknown> | null {
  return Array.isArray(value) ? value : null;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeEnvelope(value: string): StudioCiphertext {
  const parsed: unknown = JSON.parse(value);
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    typeof parsed.keyId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  )
    throw new Error("invalid envelope");
  return {
    version: 1,
    keyId: parsed.keyId,
    nonce: parsed.nonce,
    ciphertext: parsed.ciphertext,
    tag: parsed.tag,
  };
}
function failure(operation: string, cause: unknown): StudioStoreFailure {
  const message = cause instanceof Error ? cause.message : "";
  const reason = /abort|timeout/iu.test(message)
    ? "timeout"
    : /connect|socket|closed|offline/iu.test(message)
      ? "connection"
      : "command";
  return new StudioStoreFailure({ operation, reason, cause });
}
function command<A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, StudioStoreFailure> {
  return Effect.tryPromise({ try: run, catch: (cause) => failure(operation, cause) });
}
function envelope(value: StudioCiphertext): string {
  return JSON.stringify(value);
}
function admission(value: unknown): AdmissionResult {
  const result = text(value);
  if (result === "created" || result === "exists" || result === "quota_exceeded") return result;
  throw new Error("invalid response");
}

/** Builds the store over a minimal Redis command port for conformance tests and production. */
export function makeRedisStudioStore(
  port: RedisPort,
  namespace = "ffd:studio:v1",
): StudioSessionStore {
  if (!/^[A-Za-z0-9:_-]{1,64}$/u.test(namespace)) throw new Error("STUDIO_REDIS_NAMESPACE_INVALID");
  const attemptKey = (registration: string, digest: string) =>
    `${namespace}:{${registration}}:attempt:${digest}`;
  const attemptIndex = (registration: string) => `${namespace}:{${registration}}:attempts`;
  const sessionKey = (registration: string, digest: string) =>
    `${namespace}:{${registration}}:session:${digest}`;
  const sessionIndex = (registration: string) => `${namespace}:{${registration}}:sessions`;
  const evalCommand = (
    operation: string,
    script: string,
    keys: ReadonlyArray<string>,
    arguments_: ReadonlyArray<string>,
  ) => command(operation, () => port.eval(script, keys, arguments_));
  const readAttempt = (
    recordDigest: string,
    registrationDigest: string,
    nowEpochMs: number,
    consume: boolean,
  ) =>
    evalCommand(
      "studio.redis.attempt.read",
      attemptReadScript,
      [attemptKey(registrationDigest, recordDigest), attemptIndex(registrationDigest)],
      [registrationDigest, String(nowEpochMs), consume ? "1" : "0", recordDigest],
    ).pipe(
      Effect.flatMap((reply) =>
        Effect.try({
          try: (): StudioAttemptRecord | null => {
            const values = array(reply);
            if (values === null || values.length === 0) return null;
            const registration = text(values[0]);
            const expires = Number(text(values[1]));
            const encrypted = text(values[2]);
            if (
              registration !== registrationDigest ||
              !Number.isSafeInteger(expires) ||
              encrypted === null
            )
              throw new Error("invalid response");
            return {
              attemptDigest: recordDigest,
              registrationDigest,
              expiresAtEpochMs: expires,
              envelope: decodeEnvelope(encrypted),
            };
          },
          catch: (cause) =>
            new StudioStoreFailure({
              operation: "studio.redis.attempt.decode",
              reason: "invalid_response",
              cause,
            }),
        }),
      ),
    );
  return {
    capabilities: { shared: true, durable: true, atomicRefreshFence: true },
    createAttempt: (input: CreateAttemptInput) =>
      evalCommand(
        "studio.redis.attempt.create",
        createScript,
        [
          attemptKey(input.record.registrationDigest, input.record.attemptDigest),
          attemptIndex(input.record.registrationDigest),
        ],
        [
          String(input.nowEpochMs),
          String(input.record.expiresAtEpochMs),
          String(input.maximumAttemptsPerRegistration),
          input.record.attemptDigest,
          "registration",
          input.record.registrationDigest,
          "expires",
          String(input.record.expiresAtEpochMs),
          "envelope",
          envelope(input.record.envelope),
        ],
      ).pipe(
        Effect.flatMap((value) =>
          Effect.try({
            try: () => admission(value),
            catch: (cause) =>
              new StudioStoreFailure({
                operation: "studio.redis.attempt.create.decode",
                reason: "invalid_response",
                cause,
              }),
          }),
        ),
      ),
    readAttempt: (recordDigest, registrationDigest, nowEpochMs) =>
      readAttempt(recordDigest, registrationDigest, nowEpochMs, false),
    consumeAttempt: (recordDigest, registrationDigest, nowEpochMs) =>
      readAttempt(recordDigest, registrationDigest, nowEpochMs, true),
    createSession: (input: CreateSessionInput) => {
      const fields = [
        "registration",
        input.record.registrationDigest,
        "expires",
        String(input.record.expiresAtEpochMs),
        "generation",
        String(input.record.generation),
        "owner",
        input.record.refreshOwner ?? "",
        "dispatched",
        input.record.refreshDispatched ? "1" : "0",
        "lease",
        String(input.record.refreshLeaseExpiresAtEpochMs ?? 0),
        "envelope",
        envelope(input.record.envelope),
      ];
      const replacing = input.previousSessionDigest !== undefined;
      return evalCommand(
        replacing ? "studio.redis.session.replace" : "studio.redis.session.create",
        replacing ? replaceSessionScript : createScript,
        replacing
          ? [
              sessionKey(input.record.registrationDigest, input.previousSessionDigest ?? ""),
              sessionKey(input.record.registrationDigest, input.record.sessionDigest),
              sessionIndex(input.record.registrationDigest),
            ]
          : [
              sessionKey(input.record.registrationDigest, input.record.sessionDigest),
              sessionIndex(input.record.registrationDigest),
            ],
        replacing
          ? [
              String(input.nowEpochMs),
              String(input.record.expiresAtEpochMs),
              String(input.maximumSessionsPerRegistration),
              input.previousSessionDigest ?? "",
              input.record.sessionDigest,
              ...fields,
            ]
          : [
              String(input.nowEpochMs),
              String(input.record.expiresAtEpochMs),
              String(input.maximumSessionsPerRegistration),
              input.record.sessionDigest,
              ...fields,
            ],
      ).pipe(
        Effect.flatMap((value) =>
          Effect.try({
            try: () => admission(value),
            catch: (cause) =>
              new StudioStoreFailure({
                operation: "studio.redis.session.create.decode",
                reason: "invalid_response",
                cause,
              }),
          }),
        ),
      );
    },
    readSession: (recordDigest, registrationDigest, nowEpochMs) =>
      evalCommand(
        "studio.redis.session.read",
        sessionReadScript,
        [sessionKey(registrationDigest, recordDigest), sessionIndex(registrationDigest)],
        [registrationDigest, String(nowEpochMs), recordDigest],
      ).pipe(
        Effect.flatMap((reply) =>
          Effect.try({
            try: () => decodeSessionReply(reply, recordDigest, registrationDigest),
            catch: (cause) =>
              new StudioStoreFailure({
                operation: "studio.redis.session.read.decode",
                reason: "invalid_response",
                cause,
              }),
          }),
        ),
      ),
    reencryptSession: (recordDigest, registrationDigest, expectedGeneration, encrypted) =>
      booleanCommand(
        evalCommand(
          "studio.redis.session.reencrypt",
          reencryptScript,
          [sessionKey(registrationDigest, recordDigest)],
          [registrationDigest, String(expectedGeneration), envelope(encrypted)],
        ),
        "studio.redis.session.reencrypt.decode",
      ),
    claimRefresh: (
      recordDigest,
      registrationDigest,
      expectedGeneration,
      owner,
      nowEpochMs,
      leaseExpiresAtEpochMs,
    ) =>
      evalCommand(
        "studio.redis.refresh.claim",
        claimScript,
        [sessionKey(registrationDigest, recordDigest)],
        [
          registrationDigest,
          String(expectedGeneration),
          owner,
          String(nowEpochMs),
          String(leaseExpiresAtEpochMs),
        ],
      ).pipe(
        Effect.flatMap((reply) =>
          Effect.try({
            try: (): RefreshClaimResult => {
              const values = array(reply);
              const status = values === null ? null : text(values[0]);
              if (status === "missing") return { status: "missing" };
              if (status === "terminal") return { status: "terminal" };
              if (status === "busy") {
                const generation = Number(text(values?.[1]));
                if (!Number.isSafeInteger(generation)) throw new Error("invalid response");
                return { status: "busy", generation };
              }
              if (status === "claimed" && values !== null) {
                const record = decodeSessionReply(
                  values.slice(1),
                  recordDigest,
                  registrationDigest,
                );
                if (record === null) throw new Error("invalid response");
                return {
                  status: "claimed",
                  record: {
                    ...record,
                    refreshOwner: owner,
                    refreshDispatched: false,
                    refreshLeaseExpiresAtEpochMs: leaseExpiresAtEpochMs,
                  },
                };
              }
              throw new Error("invalid response");
            },
            catch: (cause) =>
              new StudioStoreFailure({
                operation: "studio.redis.refresh.claim.decode",
                reason: "invalid_response",
                cause,
              }),
          }),
        ),
      ),
    markRefreshDispatched: (recordDigest, registrationDigest, expectedGeneration, owner) =>
      booleanCommand(
        evalCommand(
          "studio.redis.refresh.dispatch",
          ownerTransitionScript,
          [sessionKey(registrationDigest, recordDigest)],
          [registrationDigest, String(expectedGeneration), owner, "dispatch"],
        ),
        "studio.redis.refresh.dispatch.decode",
      ),
    releaseRefresh: (recordDigest, registrationDigest, expectedGeneration, owner) =>
      booleanCommand(
        evalCommand(
          "studio.redis.refresh.release",
          ownerTransitionScript,
          [sessionKey(registrationDigest, recordDigest)],
          [registrationDigest, String(expectedGeneration), owner, "release"],
        ),
        "studio.redis.refresh.release.decode",
      ),
    commitRefresh: (previousDigest, expectedGeneration, owner, record) =>
      booleanCommand(
        evalCommand(
          "studio.redis.refresh.commit",
          commitScript,
          [
            sessionKey(record.registrationDigest, previousDigest),
            sessionIndex(record.registrationDigest),
          ],
          [
            String(expectedGeneration),
            owner,
            record.registrationDigest,
            String(record.expiresAtEpochMs),
            String(record.generation),
            envelope(record.envelope),
            record.sessionDigest,
          ],
        ),
        "studio.redis.refresh.commit.decode",
      ),
    deleteSession: (recordDigest, registrationDigest) =>
      evalCommand(
        "studio.redis.session.delete",
        deleteScript,
        [sessionKey(registrationDigest, recordDigest), sessionIndex(registrationDigest)],
        [registrationDigest, recordDigest],
      ).pipe(Effect.asVoid),
    evaluateRateLimit: (input: StudioRateLimitInput) =>
      evalCommand(
        "studio.redis.rate_limit",
        rateLimitScript,
        [`${namespace}:limit:${input.key}`],
        [String(input.nowEpochMs), String(input.capacity), String(input.intervalMs)],
      ).pipe(
        Effect.flatMap((reply) =>
          Effect.try({
            try: () => {
              const values = array(reply);
              const allowed = text(values?.[0]);
              const retry = Number(text(values?.[1]));
              if ((allowed !== "0" && allowed !== "1") || !Number.isSafeInteger(retry))
                throw new Error("invalid response");
              return { allowed: allowed === "1", retryAfterSeconds: retry };
            },
            catch: (cause) =>
              new StudioStoreFailure({
                operation: "studio.redis.rate_limit.decode",
                reason: "invalid_response",
                cause,
              }),
          }),
        ),
      ),
    acquirePermit: (input) =>
      booleanCommand(
        evalCommand(
          "studio.redis.permit.acquire",
          permitAcquireScript,
          [`${namespace}:permit:${input.key}`],
          [
            String(input.nowEpochMs),
            String(input.expiresAtEpochMs),
            String(input.maximum),
            input.owner,
          ],
        ),
        "studio.redis.permit.acquire.decode",
      ),
    releasePermit: (key, owner) =>
      evalCommand(
        "studio.redis.permit.release",
        permitReleaseScript,
        [`${namespace}:permit:${key}`],
        [owner],
      ).pipe(Effect.asVoid),
    close: Effect.sync(port.close),
  };
}

function decodeSessionReply(
  reply: unknown,
  recordDigest: string,
  registrationDigest: string,
): StudioSessionRecord | null {
  const values = array(reply);
  if (values === null || values.length === 0) return null;
  const registration = text(values[0]);
  const expires = Number(text(values[1]));
  const generation = Number(text(values[2]));
  const owner = text(values[3]);
  const dispatched = text(values[4]);
  const lease = Number(text(values[5]));
  const encrypted = text(values[6]);
  if (
    registration !== registrationDigest ||
    !Number.isSafeInteger(expires) ||
    !Number.isSafeInteger(generation) ||
    owner === null ||
    (dispatched !== "0" && dispatched !== "1") ||
    !Number.isSafeInteger(lease) ||
    encrypted === null
  )
    throw new Error("invalid response");
  return {
    sessionDigest: recordDigest,
    registrationDigest,
    expiresAtEpochMs: expires,
    generation,
    refreshOwner: owner === "" ? null : owner,
    refreshDispatched: dispatched === "1",
    refreshLeaseExpiresAtEpochMs: lease === 0 ? null : lease,
    envelope: decodeEnvelope(encrypted),
  };
}
function booleanCommand(
  effect: Effect.Effect<unknown, StudioStoreFailure>,
  operation: string,
): Effect.Effect<boolean, StudioStoreFailure> {
  return effect.pipe(
    Effect.flatMap((value) =>
      Effect.try({
        try: () => {
          const result = text(value);
          if (result !== "0" && result !== "1") throw new Error("invalid response");
          return result === "1";
        },
        catch: (cause) => new StudioStoreFailure({ operation, reason: "invalid_response", cause }),
      }),
    ),
  );
}

/** Creates a lazy bounded client. Redis outages fail closed; there is no in-memory fallback. */
export function createRedisStudioStore(options: RedisStudioStoreOptions): StudioSessionStore {
  const allowedKeys = new Set(["url", "durability", "timeoutMs", "reconnectAttempts", "namespace"]);
  const timeoutMs = options.timeoutMs ?? 1_000;
  const reconnectAttempts = options.reconnectAttempts ?? 2;
  let redisUrl: URL;
  try {
    redisUrl = new URL(options.url);
  } catch {
    throw new Error("STUDIO_REDIS_CONFIGURATION_INVALID");
  }
  if (!/^[A-Za-z0-9:_-]{1,64}$/u.test(options.namespace))
    throw new Error("STUDIO_REDIS_NAMESPACE_INVALID");
  if (
    Object.keys(options).some((key) => !allowedKeys.has(key)) ||
    options.durability !== "restart-stable" ||
    (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 2_000 ||
    !Number.isSafeInteger(reconnectAttempts) ||
    reconnectAttempts < 0 ||
    reconnectAttempts > 5
  )
    throw new Error("STUDIO_REDIS_CONFIGURATION_INVALID");
  const client = createClient({
    url: options.url,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1_000,
    socket: {
      connectTimeout: timeoutMs,
      socketTimeout: timeoutMs,
      reconnectStrategy: (retries) =>
        retries >= reconnectAttempts ? false : Math.min(25 * 2 ** retries, 250),
    },
  });
  const contain = () => undefined;
  client.on("error", contain);
  let connecting: Promise<void> | null = null;
  const ensure = async () => {
    if (client.isReady) return;
    if (connecting !== null) return connecting;
    if (client.isOpen) throw new Error("Redis connection is not ready.");
    const active = client.connect().then(() => undefined);
    connecting = active;
    void active
      .finally(() => {
        if (connecting === active) connecting = null;
      })
      .catch(() => undefined);
    return active;
  };
  const port: RedisPort = {
    eval: async (script, keys, arguments_) => {
      await ensure();
      return client
        .withAbortSignal(AbortSignal.timeout(timeoutMs))
        .eval(script, { keys: [...keys], arguments: [...arguments_] });
    },
    close: () => {
      client.removeListener("error", contain);
      if (client.isOpen) client.destroy();
    },
  };
  return makeRedisStudioStore(port, options.namespace);
}
