// Preserves Better Auth's per-key defense limits while routing OAuth overload to shared storage.

interface BetterAuthRateLimitRule {
  readonly window: number;
  readonly max: number;
}

interface BetterAuthRateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfter: number | null;
}

interface LocalEntry {
  readonly count: number;
  readonly windowStartedAt: number;
  readonly expiresAt: number;
}

export interface AuthRateLimitStorageOptions {
  readonly consumeOAuthGlobal: () => Promise<BetterAuthRateLimitDecision>;
  readonly maxLocalEntries?: number;
  readonly now?: () => number;
}

const oauthIngressSuffixes = ["|/oauth2/authorize", "|/oauth2/token", "|/oauth2/revoke"] as const;

function isOAuthIngressKey(key: string) {
  return oauthIngressSuffixes.some((suffix) => key.endsWith(suffix));
}

function validRule(rule: BetterAuthRateLimitRule) {
  return (
    Number.isInteger(rule.window) &&
    rule.window >= 1 &&
    rule.window <= 3_600 &&
    Number.isInteger(rule.max) &&
    rule.max >= 1 &&
    rule.max <= 100_000
  );
}

/** Creates Better Auth storage with shared OAuth overload and bounded local defense buckets. */
export function makeAuthRateLimitStorage(options: AuthRateLimitStorageOptions) {
  const entries = new Map<string, LocalEntry>();
  const maxLocalEntries = options.maxLocalEntries ?? 10_000;
  const now = options.now ?? Date.now;

  return {
    consume: async (key: string, rule: BetterAuthRateLimitRule) => {
      if (isOAuthIngressKey(key)) return options.consumeOAuthGlobal();
      if (key.length < 1 || key.length > 1_024 || !validRule(rule)) {
        return { allowed: false, retryAfter: 1 };
      }

      const currentTime = now();
      for (const [candidate, entry] of entries) {
        if (entry.expiresAt <= currentTime) entries.delete(candidate);
      }

      const windowMs = rule.window * 1_000;
      const current = entries.get(key);
      if (current === undefined || current.expiresAt <= currentTime) {
        if (entries.size >= maxLocalEntries) {
          const oldest = entries.keys().next().value;
          if (typeof oldest === "string") entries.delete(oldest);
        }
        entries.set(key, {
          count: 1,
          windowStartedAt: currentTime,
          expiresAt: currentTime + windowMs,
        });
        return { allowed: true, retryAfter: null };
      }

      if (current.count >= rule.max) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((current.expiresAt - currentTime) / 1_000)),
        };
      }

      entries.delete(key);
      entries.set(key, { ...current, count: current.count + 1 });
      return { allowed: true, retryAfter: null };
    },
  };
}
