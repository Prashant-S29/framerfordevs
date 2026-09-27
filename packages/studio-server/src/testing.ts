// Explicit in-memory adapter for deterministic development and tests. Production configuration rejects it.

import { Effect } from "effect";

import type {
  CreateAttemptInput,
  CreateSessionInput,
  RefreshClaimResult,
  StudioAttemptRecord,
  StudioRateLimitInput,
  StudioSessionRecord,
  StudioSessionStore,
} from "./store";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export function makeMemoryStudioStore(): StudioSessionStore {
  const attempts = new Map<string, StudioAttemptRecord>();
  const sessions = new Map<string, StudioSessionRecord>();
  const buckets = new Map<string, Bucket>();
  const permits = new Map<string, Map<string, number>>();
  const purge = (now: number) => {
    for (const [key, value] of attempts) if (value.expiresAtEpochMs <= now) attempts.delete(key);
    for (const [key, value] of sessions) if (value.expiresAtEpochMs <= now) sessions.delete(key);
  };
  return {
    capabilities: { shared: false, durable: false, atomicRefreshFence: true },
    createAttempt: (input: CreateAttemptInput) =>
      Effect.sync(() => {
        purge(input.nowEpochMs);
        if (attempts.has(input.record.attemptDigest)) return "exists" as const;
        const count = [...attempts.values()].filter(
          (record) => record.registrationDigest === input.record.registrationDigest,
        ).length;
        if (count >= input.maximumAttemptsPerRegistration) return "quota_exceeded" as const;
        attempts.set(input.record.attemptDigest, input.record);
        return "created" as const;
      }),
    readAttempt: (attemptDigest, registrationDigest, nowEpochMs) =>
      Effect.sync(() => {
        purge(nowEpochMs);
        const record = attempts.get(attemptDigest);
        return record?.registrationDigest === registrationDigest ? record : null;
      }),
    consumeAttempt: (attemptDigest, registrationDigest, nowEpochMs) =>
      Effect.sync(() => {
        purge(nowEpochMs);
        const record = attempts.get(attemptDigest);
        if (record === undefined || record.registrationDigest !== registrationDigest) return null;
        attempts.delete(attemptDigest);
        return record;
      }),
    createSession: (input: CreateSessionInput) =>
      Effect.sync(() => {
        purge(input.nowEpochMs);
        if (sessions.has(input.record.sessionDigest)) return "exists" as const;
        if (input.previousSessionDigest !== undefined) {
          const previous = sessions.get(input.previousSessionDigest);
          if (previous?.registrationDigest === input.record.registrationDigest)
            sessions.delete(input.previousSessionDigest);
        }
        const count = [...sessions.values()].filter(
          (record) => record.registrationDigest === input.record.registrationDigest,
        ).length;
        if (count >= input.maximumSessionsPerRegistration) return "quota_exceeded" as const;
        sessions.set(input.record.sessionDigest, input.record);
        return "created" as const;
      }),
    readSession: (sessionDigest, registrationDigest, nowEpochMs) =>
      Effect.sync(() => {
        purge(nowEpochMs);
        const record = sessions.get(sessionDigest);
        return record?.registrationDigest === registrationDigest ? record : null;
      }),
    reencryptSession: (sessionDigest, registrationDigest, expectedGeneration, envelope) =>
      Effect.sync(() => {
        const record = sessions.get(sessionDigest);
        if (
          record === undefined ||
          record.registrationDigest !== registrationDigest ||
          record.generation !== expectedGeneration ||
          record.refreshOwner !== null
        )
          return false;
        sessions.set(sessionDigest, { ...record, envelope });
        return true;
      }),
    claimRefresh: (
      sessionDigest,
      registrationDigest,
      expectedGeneration,
      owner,
      nowEpochMs,
      leaseExpiresAtEpochMs,
    ) =>
      Effect.sync((): RefreshClaimResult => {
        purge(nowEpochMs);
        const record = sessions.get(sessionDigest);
        if (
          record === undefined ||
          record.registrationDigest !== registrationDigest ||
          record.generation !== expectedGeneration
        )
          return { status: "missing" };
        if (
          record.refreshOwner !== null &&
          (record.refreshLeaseExpiresAtEpochMs ?? 0) > nowEpochMs
        ) {
          return { status: "busy", generation: record.generation };
        }
        if (record.refreshOwner !== null && record.refreshDispatched) return { status: "terminal" };
        const claimed = {
          ...record,
          refreshOwner: owner,
          refreshDispatched: false,
          refreshLeaseExpiresAtEpochMs: leaseExpiresAtEpochMs,
        };
        sessions.set(sessionDigest, claimed);
        return { status: "claimed", record: claimed };
      }),
    markRefreshDispatched: (sessionDigest, registrationDigest, expectedGeneration, owner) =>
      Effect.sync(() => {
        const record = sessions.get(sessionDigest);
        if (
          record === undefined ||
          record.registrationDigest !== registrationDigest ||
          record.generation !== expectedGeneration ||
          record.refreshOwner !== owner
        )
          return false;
        sessions.set(sessionDigest, { ...record, refreshDispatched: true });
        return true;
      }),
    releaseRefresh: (sessionDigest, registrationDigest, expectedGeneration, owner) =>
      Effect.sync(() => {
        const record = sessions.get(sessionDigest);
        if (
          record === undefined ||
          record.registrationDigest !== registrationDigest ||
          record.generation !== expectedGeneration ||
          record.refreshOwner !== owner ||
          record.refreshDispatched
        )
          return false;
        sessions.set(sessionDigest, {
          ...record,
          refreshOwner: null,
          refreshDispatched: false,
          refreshLeaseExpiresAtEpochMs: null,
        });
        return true;
      }),
    commitRefresh: (previousSessionDigest, expectedGeneration, owner, record) =>
      Effect.sync(() => {
        const previous = sessions.get(previousSessionDigest);
        if (
          previous === undefined ||
          previous.registrationDigest !== record.registrationDigest ||
          previous.generation !== expectedGeneration ||
          previous.refreshOwner !== owner ||
          !previous.refreshDispatched
        )
          return false;
        sessions.delete(previousSessionDigest);
        sessions.set(record.sessionDigest, record);
        return true;
      }),
    deleteSession: (sessionDigest, registrationDigest) =>
      Effect.sync(() => {
        const record = sessions.get(sessionDigest);
        if (record?.registrationDigest === registrationDigest) sessions.delete(sessionDigest);
      }),
    evaluateRateLimit: (input: StudioRateLimitInput) =>
      Effect.sync(() => {
        const bucket = buckets.get(input.key) ?? {
          tokens: input.capacity,
          updatedAt: input.nowEpochMs,
        };
        const refill =
          (Math.max(0, input.nowEpochMs - bucket.updatedAt) * input.capacity) / input.intervalMs;
        const tokens = Math.min(input.capacity, bucket.tokens + refill);
        const allowed = tokens >= 1;
        buckets.set(input.key, {
          tokens: allowed ? tokens - 1 : tokens,
          updatedAt: input.nowEpochMs,
        });
        const missing = Math.max(0, 1 - tokens);
        return {
          allowed,
          retryAfterSeconds: allowed
            ? 0
            : Math.max(1, Math.ceil((missing * input.intervalMs) / input.capacity / 1_000)),
        };
      }),
    acquirePermit: (input) =>
      Effect.sync(() => {
        const active = permits.get(input.key) ?? new Map<string, number>();
        for (const [owner, expiry] of active) if (expiry <= input.nowEpochMs) active.delete(owner);
        if (active.has(input.owner) || active.size >= input.maximum) return false;
        active.set(input.owner, input.expiresAtEpochMs);
        permits.set(input.key, active);
        return true;
      }),
    releasePermit: (key, owner) =>
      Effect.sync(() => {
        const active = permits.get(key);
        active?.delete(owner);
        if (active?.size === 0) permits.delete(key);
      }),
    close: Effect.sync(() => {
      attempts.clear();
      sessions.clear();
      buckets.clear();
      permits.clear();
    }),
  };
}
