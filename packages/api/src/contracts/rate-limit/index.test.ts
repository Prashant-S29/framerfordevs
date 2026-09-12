// Verifies the closed policy registry and transport-neutral rate-limit decision contract.

import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  RateLimitCost,
  RateLimitDecision,
  RateLimitPolicy,
  rateLimitPolicies,
  rateLimitPolicyValues,
} from "./index";

describe("rate-limit contracts", () => {
  it("keeps every registered policy source-controlled and configured", () => {
    expect(Object.keys(rateLimitPolicies).sort()).toEqual([...rateLimitPolicyValues].sort());
    expect(Schema.decodeUnknownSync(RateLimitPolicy)("delivery.credential")).toBe(
      "delivery.credential",
    );
    expect(() => Schema.decodeUnknownSync(RateLimitPolicy)("caller.policy")).toThrow();
  });

  it("keeps approved Control Plane budgets closed and source-controlled", () => {
    expect(rateLimitPolicies["control-plane.global"]).toEqual({
      policy: "control-plane.global",
      limitPerInterval: 3_000,
      intervalMs: 60_000,
      capacity: 250,
    });
    expect(rateLimitPolicies["control-plane.user"]).toEqual({
      policy: "control-plane.user",
      limitPerInterval: 120,
      intervalMs: 60_000,
      capacity: 20,
    });
    expect(rateLimitPolicies["control-plane.credential"]).toEqual({
      policy: "control-plane.credential",
      limitPerInterval: 120,
      intervalMs: 60_000,
      capacity: 20,
    });
  });

  it("keeps approved Preview and webhook budgets closed and source-controlled", () => {
    expect(rateLimitPolicies["preview.global"]).toEqual({
      policy: "preview.global",
      limitPerInterval: 12_000,
      intervalMs: 60_000,
      capacity: 1_000,
    });
    expect(rateLimitPolicies["preview.credential"]).toEqual({
      policy: "preview.credential",
      limitPerInterval: 300,
      intervalMs: 60_000,
      capacity: 50,
    });
    expect(rateLimitPolicies["preview.user"]).toEqual({
      policy: "preview.user",
      limitPerInterval: 300,
      intervalMs: 60_000,
      capacity: 50,
    });
    expect(rateLimitPolicies["webhook.replay.user"]).toEqual({
      policy: "webhook.replay.user",
      limitPerInterval: 30,
      intervalMs: 60_000,
      capacity: 5,
    });
  });

  it("bounds weighted costs before store evaluation", () => {
    expect(Schema.decodeUnknownSync(RateLimitCost)(1)).toBe(1);
    expect(Schema.decodeUnknownSync(RateLimitCost)(100)).toBe(100);
    expect(() => Schema.decodeUnknownSync(RateLimitCost)(0)).toThrow();
    expect(() => Schema.decodeUnknownSync(RateLimitCost)(101)).toThrow();
    expect(() => Schema.decodeUnknownSync(RateLimitCost)(1.5)).toThrow();
  });

  it("decodes a complete decision without identifiers or provider details", () => {
    const decision = Schema.decodeUnknownSync(RateLimitDecision)({
      allowed: false,
      policy: "delivery.anonymous",
      cost: 6,
      limit: 120,
      remaining: 2,
      resetAtEpochMs: 10_000,
      retryAfterSeconds: 2,
      enforcementMode: "redis",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(2);
    expect(Object.hasOwn(decision, "identity")).toBe(false);
  });
});
