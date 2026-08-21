// Defines deterministic receiver responses for success, retry, redirect, timeout, and idempotency tests.

import type { PlannedResponse, ScenarioKey, VerificationCategory } from "./types.js";

/** Selects the deterministic response used to exercise one sender behavior. */
export function planScenario(scenario: ScenarioKey, attemptNumber: number): PlannedResponse {
  switch (scenario) {
    case "success":
      return {
        status: 204,
        delayMs: 0,
        retryAfter: null,
        location: null,
        code: "accepted",
        acceptsEvent: true,
      };
    case "retry-twice":
      return attemptNumber <= 2
        ? {
            status: 503,
            delayMs: 0,
            retryAfter: "1",
            location: null,
            code: "planned_retry",
            acceptsEvent: false,
          }
        : {
            status: 204,
            delayMs: 0,
            retryAfter: null,
            location: null,
            code: "accepted_after_retries",
            acceptsEvent: true,
          };
    case "rate-limit-once":
      return attemptNumber === 1
        ? {
            status: 429,
            delayMs: 0,
            retryAfter: "35",
            location: null,
            code: "planned_rate_limit",
            acceptsEvent: false,
          }
        : {
            status: 204,
            delayMs: 0,
            retryAfter: null,
            location: null,
            code: "accepted_after_rate_limit",
            acceptsEvent: true,
          };
    case "permanent-failure":
      return {
        status: 410,
        delayMs: 0,
        retryAfter: null,
        location: null,
        code: "planned_permanent_failure",
        acceptsEvent: false,
      };
    case "redirect":
      return {
        status: 302,
        delayMs: 0,
        retryAfter: null,
        location: "/hooks/success",
        code: "planned_redirect",
        acceptsEvent: false,
      };
    case "slow":
      return {
        status: 204,
        delayMs: 12_000,
        retryAfter: null,
        location: null,
        code: "planned_slow_success",
        acceptsEvent: true,
      };
    case "idempotent":
      return {
        status: 204,
        delayMs: 0,
        retryAfter: null,
        location: null,
        code: "accepted_idempotently",
        acceptsEvent: true,
      };
  }
}

/** Maps verification failures to bounded responses without revealing verification details. */
export function planVerificationFailure(category: VerificationCategory): PlannedResponse {
  const status =
    category === "missing_secret"
      ? 503
      : category === "invalid_payload"
        ? 422
        : category === "stale_timestamp" || category === "invalid_signature"
          ? 401
          : 400;
  return {
    status,
    delayMs: 0,
    retryAfter: category === "missing_secret" ? "30" : null,
    location: null,
    code: category,
    acceptsEvent: false,
  };
}
