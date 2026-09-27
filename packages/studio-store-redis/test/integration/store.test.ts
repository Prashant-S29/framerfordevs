import { randomBytes } from "node:crypto";

import { Effect } from "effect";
import { afterAll, describe, expect, it } from "vitest";

import { createRedisStudioStore, makeRedisStudioStore } from "../../src";
import type { StudioCiphertext, StudioSessionRecord } from "@framerfordevs/studio-server/store";

const url = process.env.STUDIO_TEST_REDIS_URL ?? "redis://127.0.0.1:6380";
const namespace = `ffd:studio:test:${randomBytes(8).toString("hex")}`;
const first = createRedisStudioStore({
  url,
  durability: "restart-stable",
  namespace,
  timeoutMs: 500,
  reconnectAttempts: 0,
});
const second = createRedisStudioStore({
  url,
  durability: "restart-stable",
  namespace,
  timeoutMs: 500,
  reconnectAttempts: 0,
});
const registrationDigest = "a".repeat(64);
const envelope: StudioCiphertext = {
  version: 1,
  keyId: "active",
  nonce: "nonce",
  ciphertext: "ciphertext",
  tag: "tag",
};
const now = Date.now();

function session(generation = 1): StudioSessionRecord {
  return {
    sessionDigest: "c".repeat(64),
    registrationDigest,
    expiresAtEpochMs: now + 60_000,
    generation,
    refreshOwner: null,
    refreshDispatched: false,
    refreshLeaseExpiresAtEpochMs: null,
    envelope,
  };
}

afterAll(async () => {
  await Effect.runPromise(first.close);
  await Effect.runPromise(second.close);
});

describe("Redis Studio store conformance", () => {
  it("shares one-shot attempts across independently created clients", async () => {
    const record = {
      attemptDigest: "b".repeat(64),
      registrationDigest,
      expiresAtEpochMs: now + 60_000,
      envelope,
    };
    expect(
      await Effect.runPromise(
        first.createAttempt({ record, nowEpochMs: now, maximumAttemptsPerRegistration: 10 }),
      ),
    ).toBe("created");
    expect(
      await Effect.runPromise(second.readAttempt(record.attemptDigest, registrationDigest, now)),
    ).toEqual(record);
    expect(
      await Effect.runPromise(second.consumeAttempt(record.attemptDigest, registrationDigest, now)),
    ).toEqual(record);
    expect(
      await Effect.runPromise(first.consumeAttempt(record.attemptDigest, registrationDigest, now)),
    ).toBeNull();
  });

  it("shares exact token-bucket and attempt-quota boundaries across clients", async () => {
    const rateKey = `login:${registrationDigest}:boundary`;
    const rateInput = { key: rateKey, nowEpochMs: now, capacity: 2, intervalMs: 2_000 };
    expect((await Effect.runPromise(first.evaluateRateLimit(rateInput))).allowed).toBe(true);
    expect((await Effect.runPromise(second.evaluateRateLimit(rateInput))).allowed).toBe(true);
    expect(await Effect.runPromise(first.evaluateRateLimit(rateInput))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(
      (await Effect.runPromise(second.evaluateRateLimit({ ...rateInput, nowEpochMs: now + 1_000 })))
        .allowed,
    ).toBe(true);

    const quotaRegistration = "9".repeat(64);
    const attempt = (index: number) => ({
      attemptDigest: String(index).padStart(64, "0"),
      registrationDigest: quotaRegistration,
      expiresAtEpochMs: now + 60_000,
      envelope,
    });
    expect(
      await Effect.runPromise(
        first.createAttempt({
          record: attempt(1),
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 2,
        }),
      ),
    ).toBe("created");
    expect(
      await Effect.runPromise(
        second.createAttempt({
          record: attempt(2),
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 2,
        }),
      ),
    ).toBe("created");
    expect(
      await Effect.runPromise(
        first.createAttempt({
          record: attempt(3),
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 2,
        }),
      ),
    ).toBe("quota_exceeded");
    expect(
      await Effect.runPromise(
        second.consumeAttempt(attempt(1).attemptDigest, quotaRegistration, now),
      ),
    ).toEqual(attempt(1));
    expect(
      await Effect.runPromise(
        first.createAttempt({
          record: attempt(3),
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 2,
        }),
      ),
    ).toBe("created");
  });

  it("caps one cleanup operation at exactly 100 expired records", async () => {
    const cleanupRegistration = "5".repeat(64);
    const attempt = (index: number) => ({
      attemptDigest: String(index).padStart(64, "0"),
      registrationDigest: cleanupRegistration,
      expiresAtEpochMs: now + 60_000,
      envelope,
    });
    for (let index = 0; index < 101; index += 1) {
      expect(
        await Effect.runPromise(
          first.createAttempt({
            record: attempt(index),
            nowEpochMs: now,
            maximumAttemptsPerRegistration: 101,
          }),
        ),
      ).toBe("created");
    }
    expect(
      await Effect.runPromise(
        first.createAttempt({
          record: { ...attempt(102), expiresAtEpochMs: now + 120_000 },
          nowEpochMs: now + 60_001,
          maximumAttemptsPerRegistration: 1,
        }),
      ),
    ).toBe("quota_exceeded");
    expect(
      await Effect.runPromise(
        second.createAttempt({
          record: { ...attempt(102), expiresAtEpochMs: now + 120_000 },
          nowEpochMs: now + 60_001,
          maximumAttemptsPerRegistration: 1,
        }),
      ),
    ).toBe("created");
  });

  it("admits exactly one refresh owner before provider dispatch", async () => {
    const record = session();
    expect(
      await Effect.runPromise(
        first.createSession({ record, nowEpochMs: now, maximumSessionsPerRegistration: 10 }),
      ),
    ).toBe("created");
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Effect.runPromise(
          (index % 2 === 0 ? first : second).claimRefresh(
            record.sessionDigest,
            registrationDigest,
            1,
            `owner-${index}`,
            now,
            now + 10_000,
          ),
        ),
      ),
    );
    const claimed = claims.filter((claim) => claim.status === "claimed");
    expect(claimed).toHaveLength(1);
    const winner = claimed[0];
    if (winner?.status !== "claimed" || winner.record.refreshOwner === null)
      throw new Error("missing winner");
    expect(
      await Effect.runPromise(
        second.markRefreshDispatched(
          record.sessionDigest,
          registrationDigest,
          1,
          winner.record.refreshOwner,
        ),
      ),
    ).toBe(true);
    expect(
      await Effect.runPromise(
        first.releaseRefresh(
          record.sessionDigest,
          registrationDigest,
          1,
          winner.record.refreshOwner,
        ),
      ),
    ).toBe(false);
    expect(
      await Effect.runPromise(
        first.commitRefresh(record.sessionDigest, 1, winner.record.refreshOwner, session(2)),
      ),
    ).toBe(true);
    expect(
      (await Effect.runPromise(second.readSession(record.sessionDigest, registrationDigest, now)))
        ?.generation,
    ).toBe(2);

    const recovery = await Effect.runPromise(
      first.claimRefresh(
        record.sessionDigest,
        registrationDigest,
        2,
        "crashed-owner",
        now,
        now + 1,
      ),
    );
    expect(recovery.status).toBe("claimed");
    expect(
      await Effect.runPromise(
        first.markRefreshDispatched(record.sessionDigest, registrationDigest, 2, "crashed-owner"),
      ),
    ).toBe(true);
    const terminal = await Effect.runPromise(
      second.claimRefresh(
        record.sessionDigest,
        registrationDigest,
        2,
        "recovery-owner",
        now + 2,
        now + 10_000,
      ),
    );
    expect(terminal).toEqual({ status: "terminal" });
  });

  it("atomically replaces an existing browser session during re-authentication", async () => {
    const previous = { ...session(), sessionDigest: "1".repeat(64) };
    const replacement = { ...session(), sessionDigest: "2".repeat(64) };
    expect(
      await Effect.runPromise(
        first.createSession({
          record: previous,
          nowEpochMs: now,
          maximumSessionsPerRegistration: 10,
        }),
      ),
    ).toBe("created");
    expect(
      await Effect.runPromise(
        second.createSession({
          record: replacement,
          nowEpochMs: now,
          maximumSessionsPerRegistration: 10,
          previousSessionDigest: previous.sessionDigest,
        }),
      ),
    ).toBe("created");
    expect(
      await Effect.runPromise(first.readSession(previous.sessionDigest, registrationDigest, now)),
    ).toBeNull();
    expect(
      await Effect.runPromise(
        first.readSession(replacement.sessionDigest, registrationDigest, now),
      ),
    ).toEqual(replacement);
  });

  it("uses registration hash tags for every multi-key atomic operation", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const store = makeRedisStudioStore(
      {
        eval: async (_script, keys) => {
          calls.push(keys);
          return "created";
        },
        close: () => undefined,
      },
      "ffd:studio:test:epoch",
    );
    await Effect.runPromise(
      store.createAttempt({
        record: {
          attemptDigest: "7".repeat(64),
          registrationDigest,
          expiresAtEpochMs: now + 60_000,
          envelope,
        },
        nowEpochMs: now,
        maximumAttemptsPerRegistration: 20,
      }),
    );
    await Effect.runPromise(
      store.createSession({
        record: { ...session(), sessionDigest: "8".repeat(64) },
        nowEpochMs: now,
        maximumSessionsPerRegistration: 1_024,
        previousSessionDigest: "6".repeat(64),
      }),
    );
    expect(calls).toHaveLength(2);
    for (const keys of calls) {
      expect(keys.length).toBeGreaterThan(1);
      expect(keys.every((key) => key.includes(`{${registrationDigest}}`))).toBe(true);
      expect(new Set(keys.map((key) => key.match(/\{[^}]+\}/u)?.[0])).size).toBe(1);
    }
    expect(JSON.stringify(calls)).not.toContain("ciphertext");
    await Effect.runPromise(store.close);
  });

  it("survives client disposal and enforces atomic registration quotas", async () => {
    const localNamespace = `${namespace}:restart`;
    const before = createRedisStudioStore({
      url,
      durability: "restart-stable",
      namespace: localNamespace,
      timeoutMs: 500,
      reconnectAttempts: 0,
    });
    const record = { ...session(), sessionDigest: "d".repeat(64) };
    expect(
      await Effect.runPromise(
        before.createSession({ record, nowEpochMs: now, maximumSessionsPerRegistration: 1 }),
      ),
    ).toBe("created");
    await Effect.runPromise(before.close);
    const after = createRedisStudioStore({
      url,
      durability: "restart-stable",
      namespace: localNamespace,
      timeoutMs: 500,
      reconnectAttempts: 0,
    });
    expect(
      await Effect.runPromise(after.readSession(record.sessionDigest, registrationDigest, now)),
    ).toEqual(record);
    expect(
      await Effect.runPromise(
        after.createSession({
          record: { ...record, sessionDigest: "e".repeat(64) },
          nowEpochMs: now,
          maximumSessionsPerRegistration: 1,
        }),
      ),
    ).toBe("quota_exceeded");
    const rotatedEpoch = createRedisStudioStore({
      url,
      durability: "restart-stable",
      namespace: `${localNamespace}:restored-snapshot-2`,
      timeoutMs: 500,
      reconnectAttempts: 0,
    });
    expect(
      await Effect.runPromise(
        rotatedEpoch.readSession(record.sessionDigest, registrationDigest, now),
      ),
    ).toBeNull();
    await Effect.runPromise(after.close);
    await Effect.runPromise(rotatedEpoch.close);
  });

  it("shares bounded operation permits across clients and releases them", async () => {
    const key = `callback:${registrationDigest}`;
    const permit = (owner: string) => ({
      key,
      owner,
      nowEpochMs: now,
      expiresAtEpochMs: now + 10_000,
      maximum: 2,
    });
    expect(await Effect.runPromise(first.acquirePermit(permit("owner-1")))).toBe(true);
    expect(await Effect.runPromise(second.acquirePermit(permit("owner-2")))).toBe(true);
    expect(await Effect.runPromise(first.acquirePermit(permit("owner-3")))).toBe(false);
    await Effect.runPromise(second.releasePermit(key, "owner-2"));
    expect(await Effect.runPromise(first.acquirePermit(permit("owner-3")))).toBe(true);
  });

  it("requires exact bounded production-client configuration", async () => {
    for (const timeoutMs of [100, 2_000]) {
      const store = createRedisStudioStore({
        url,
        durability: "restart-stable",
        namespace: `${namespace}:timeout-${timeoutMs}`,
        timeoutMs,
        reconnectAttempts: timeoutMs === 100 ? 0 : 5,
      });
      await Effect.runPromise(store.close);
    }
    for (const timeoutMs of [99, 2_001]) {
      expect(() =>
        createRedisStudioStore({
          url,
          durability: "restart-stable",
          namespace: `${namespace}:invalid-${timeoutMs}`,
          timeoutMs,
          reconnectAttempts: 0,
        }),
      ).toThrow("STUDIO_REDIS_CONFIGURATION_INVALID");
    }
    expect(() =>
      createRedisStudioStore({
        url,
        durability: "restart-stable",
        namespace: `${namespace}:invalid-reconnects`,
        reconnectAttempts: 6,
      }),
    ).toThrow("STUDIO_REDIS_CONFIGURATION_INVALID");
  });

  it("requires an explicit bounded deployment namespace epoch", () => {
    expect(() =>
      createRedisStudioStore({
        url,
        durability: "restart-stable",
        namespace: "",
      }),
    ).toThrow("STUDIO_REDIS_NAMESPACE_INVALID");
    expect(() =>
      createRedisStudioStore({
        url,
        durability: "restart-stable",
        namespace: "x".repeat(65),
      }),
    ).toThrow("STUDIO_REDIS_NAMESPACE_INVALID");
  });

  it("fails closed within a bounded interval when Redis is unavailable", async () => {
    const unavailable = createRedisStudioStore({
      url: "redis://127.0.0.1:6399",
      durability: "restart-stable",
      namespace: `${namespace}:down`,
      timeoutMs: 100,
      reconnectAttempts: 0,
    });
    const started = performance.now();
    await expect(
      Effect.runPromise(unavailable.readSession("f".repeat(64), registrationDigest, Date.now())),
    ).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(2_000);
    await Effect.runPromise(unavailable.close);
  });
});
