import { Clock, Context, Effect, Layer } from "effect";

import { RateLimitedFailure } from "../contracts/errors";

interface AttemptEntry {
  readonly windowStartedAt: number;
  readonly failures: number;
  readonly lastSeenAt: number;
}

export interface CredentialAttemptLimiterOptions {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly maxEntries: number;
}

const defaultOptions: CredentialAttemptLimiterOptions = {
  maxFailures: 10,
  windowMs: 60_000,
  maxEntries: 10_000,
};

function oldestFingerprint(entries: ReadonlyMap<string, AttemptEntry>): string | undefined {
  let oldestKey: string | undefined;
  let oldestSeenAt = Number.POSITIVE_INFINITY;
  for (const [fingerprint, entry] of entries) {
    if (entry.lastSeenAt < oldestSeenAt) {
      oldestKey = fingerprint;
      oldestSeenAt = entry.lastSeenAt;
    }
  }
  return oldestKey;
}

export function makeCredentialAttemptLimiter(
  options: CredentialAttemptLimiterOptions = defaultOptions,
) {
  const entries = new Map<string, AttemptEntry>();

  const currentEntry = (fingerprint: string, now: number) => {
    const entry = entries.get(fingerprint);
    if (!entry) return undefined;
    if (now - entry.windowStartedAt >= options.windowMs) {
      entries.delete(fingerprint);
      return undefined;
    }
    return entry;
  };

  return {
    assertAllowed: Effect.fn("CredentialAttemptLimiter.assertAllowed")(function* (
      fingerprint: string,
    ) {
      const now = yield* Clock.currentTimeMillis;
      const entry = yield* Effect.sync(() => currentEntry(fingerprint, now));
      if (entry && entry.failures >= options.maxFailures) {
        return yield* RateLimitedFailure.make();
      }
    }),

    recordFailure: Effect.fn("CredentialAttemptLimiter.recordFailure")(function* (
      fingerprint: string,
    ) {
      const now = yield* Clock.currentTimeMillis;
      yield* Effect.sync(() => {
        const entry = currentEntry(fingerprint, now);
        if (!entry && !entries.has(fingerprint) && entries.size >= options.maxEntries) {
          const oldest = oldestFingerprint(entries);
          if (oldest !== undefined) entries.delete(oldest);
        }
        entries.set(fingerprint, {
          windowStartedAt: entry?.windowStartedAt ?? now,
          failures: (entry?.failures ?? 0) + 1,
          lastSeenAt: now,
        });
      });
    }),

    reset: Effect.fn("CredentialAttemptLimiter.reset")(function* (fingerprint: string) {
      yield* Effect.sync(() => entries.delete(fingerprint));
    }),

    retainedEntryCount: Effect.fn("CredentialAttemptLimiter.retainedEntryCount")(() =>
      Effect.sync(() => entries.size),
    ),
  };
}

export class CredentialAttemptLimiter extends Context.Tag("CredentialAttemptLimiter")<
  CredentialAttemptLimiter,
  ReturnType<typeof makeCredentialAttemptLimiter>
>() {}

export const CredentialAttemptLimiterLive = Layer.succeed(
  CredentialAttemptLimiter,
  makeCredentialAttemptLimiter(),
);
