// Defines the closed repository-wide rate-limit policies, weighted costs, and transport-neutral decisions.

import { Schema } from "effect";

export const rateLimitPolicyValues = [
  "credential.verification.invalid",
  "delivery.anonymous",
  "delivery.credential",
  "delivery.global",
  "preview.credential",
  "preview.global",
  "preview.user",
  "webhook.replay.user",
] as const;

export const RateLimitPolicy = Schema.Literal(...rateLimitPolicyValues);
export type RateLimitPolicy = typeof RateLimitPolicy.Type;

export const RateLimitEnforcementMode = Schema.Literal("redis", "memory", "degraded_memory");
export type RateLimitEnforcementMode = typeof RateLimitEnforcementMode.Type;

export const RateLimitCost = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, 100),
  Schema.brand("RateLimitCost"),
);
export type RateLimitCost = typeof RateLimitCost.Type;

const NonNegativeInteger = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const PositiveInteger = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));

export class RateLimitDecision extends Schema.Class<RateLimitDecision>("RateLimitDecision")({
  allowed: Schema.Boolean,
  policy: RateLimitPolicy,
  cost: RateLimitCost,
  limit: PositiveInteger,
  remaining: NonNegativeInteger,
  resetAtEpochMs: NonNegativeInteger,
  retryAfterSeconds: Schema.NullOr(PositiveInteger),
  enforcementMode: RateLimitEnforcementMode,
}) {}

export interface RateLimitPolicyConfiguration {
  readonly policy: RateLimitPolicy;
  readonly limitPerInterval: number;
  readonly intervalMs: number;
  readonly capacity: number;
}

export const rateLimitPolicies = {
  "credential.verification.invalid": {
    policy: "credential.verification.invalid",
    limitPerInterval: 10,
    intervalMs: 60_000,
    capacity: 10,
  },
  "delivery.anonymous": {
    policy: "delivery.anonymous",
    limitPerInterval: 120,
    intervalMs: 60_000,
    capacity: 30,
  },
  "delivery.credential": {
    policy: "delivery.credential",
    limitPerInterval: 600,
    intervalMs: 60_000,
    capacity: 100,
  },
  "delivery.global": {
    policy: "delivery.global",
    limitPerInterval: 30_000,
    intervalMs: 60_000,
    capacity: 5_000,
  },
  "preview.credential": {
    policy: "preview.credential",
    limitPerInterval: 300,
    intervalMs: 60_000,
    capacity: 50,
  },
  "preview.global": {
    policy: "preview.global",
    limitPerInterval: 12_000,
    intervalMs: 60_000,
    capacity: 1_000,
  },
  "preview.user": {
    policy: "preview.user",
    limitPerInterval: 300,
    intervalMs: 60_000,
    capacity: 50,
  },
  "webhook.replay.user": {
    policy: "webhook.replay.user",
    limitPerInterval: 30,
    intervalMs: 60_000,
    capacity: 5,
  },
} satisfies Readonly<Record<RateLimitPolicy, RateLimitPolicyConfiguration>>;
