// Locks deterministic HTTP behavior for every real-network webhook receiver scenario.

import assert from "node:assert/strict";
import { test } from "node:test";

import { planScenario } from "./index.js";

test("retry-twice fails twice and then accepts", () => {
  assert.equal(planScenario("retry-twice", 1).status, 503);
  assert.equal(planScenario("retry-twice", 2).status, 503);
  assert.equal(planScenario("retry-twice", 3).status, 204);
});

test("rate-limit-once emits bounded Retry-After before accepting", () => {
  assert.deepEqual(planScenario("rate-limit-once", 1), {
    status: 429,
    delayMs: 0,
    retryAfter: "35",
    location: null,
    code: "planned_rate_limit",
    acceptsEvent: false,
  });
  assert.equal(planScenario("rate-limit-once", 2).status, 204);
});

test("permanent, redirect, and slow scenarios expose distinct terminal behavior", () => {
  assert.equal(planScenario("permanent-failure", 1).status, 410);
  assert.equal(planScenario("redirect", 1).status, 302);
  assert.equal(planScenario("slow", 1).delayMs, 12_000);
});
