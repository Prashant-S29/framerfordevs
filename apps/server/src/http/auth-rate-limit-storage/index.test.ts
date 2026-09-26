import { describe, expect, it, vi } from "vitest";

import { makeAuthRateLimitStorage } from "./index";

describe("auth rate-limit storage", () => {
  it("routes only OAuth ingress to the shared installation guard", async () => {
    const consumeOAuthGlobal = vi.fn(() => Promise.resolve({ allowed: true, retryAfter: null }));
    const storage = makeAuthRateLimitStorage({ consumeOAuthGlobal });

    await storage.consume("no-trusted-ip|/oauth2/authorize", { window: 60, max: 3_000 });
    await storage.consume("no-trusted-ip|/oauth2/token", { window: 60, max: 3_000 });
    await storage.consume("no-trusted-ip|/oauth2/revoke", { window: 60, max: 3_000 });
    await storage.consume("no-trusted-ip|/sign-in/email", { window: 10, max: 3 });

    expect(consumeOAuthGlobal).toHaveBeenCalledTimes(3);
  });

  it("fails closed on shared OAuth storage outage and recovers on the next evaluation", async () => {
    const outage = new Error("shared quota unavailable");
    const consumeOAuthGlobal = vi
      .fn<() => Promise<{ readonly allowed: boolean; readonly retryAfter: number | null }>>()
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce({ allowed: true, retryAfter: null });
    const storage = makeAuthRateLimitStorage({ consumeOAuthGlobal });
    const key = "no-trusted-ip|/oauth2/authorize";
    const rule = { window: 60, max: 3_000 };

    await expect(storage.consume(key, rule)).rejects.toBe(outage);
    await expect(storage.consume(key, rule)).resolves.toEqual({
      allowed: true,
      retryAfter: null,
    });
  });

  it("preserves Better Auth's supplied non-OAuth key and rule", async () => {
    let now = 1_000;
    const storage = makeAuthRateLimitStorage({
      consumeOAuthGlobal: () => Promise.resolve({ allowed: true, retryAfter: null }),
      now: () => now,
    });
    const key = "no-trusted-ip|/sign-in/email";
    const rule = { window: 10, max: 3 };

    expect((await storage.consume(key, rule)).allowed).toBe(true);
    expect((await storage.consume(key, rule)).allowed).toBe(true);
    expect((await storage.consume(key, rule)).allowed).toBe(true);
    expect(await storage.consume(key, rule)).toEqual({ allowed: false, retryAfter: 10 });

    now += 10_000;
    expect(await storage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null });
  });

  it("bounds local storage and denies malformed rules", async () => {
    const storage = makeAuthRateLimitStorage({
      consumeOAuthGlobal: () => Promise.resolve({ allowed: true, retryAfter: null }),
      maxLocalEntries: 1,
    });

    await storage.consume("source-a|/session", { window: 10, max: 2 });
    await storage.consume("source-b|/session", { window: 10, max: 2 });

    expect(await storage.consume("source-a|/session", { window: 0, max: 2 })).toEqual({
      allowed: false,
      retryAfter: 1,
    });
  });
});
