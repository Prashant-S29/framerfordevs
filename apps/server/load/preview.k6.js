// Exercises the approved M10 Preview capacity and resilience gates as separate profiles.
import http from "k6/http";
import execution from "k6/execution";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const latency = new Trend("preview_duration", true);
const errors = new Rate("preview_unexpected_errors");
const intentional429 = new Rate("preview_intentional_429_ratio");
const coherenceErrors = new Rate("preview_coherence_errors");
const ok = new Counter("preview_status_2xx");
const limited = new Counter("preview_status_429");
const limitedPrimary = new Counter("preview_status_429_primary");
const limitedSecondary = new Counter("preview_status_429_secondary");
const oversized = new Counter("preview_status_413");

const baseUrl = __ENV.PREVIEW_BASE_URL;
const secondaryUrl = __ENV.PREVIEW_SECONDARY_BASE_URL;
const credentials = (__ENV.PREVIEW_CREDENTIALS || "").split(",").filter(Boolean);
const currentPaths = (__ENV.PREVIEW_CURRENT_PATHS || "").split(",").filter(Boolean);
const revisionPaths = (__ENV.PREVIEW_REVISION_PATHS || "").split(",").filter(Boolean);
const oversizedPath = __ENV.PREVIEW_OVERSIZED_PATH;
const concurrencyPath = __ENV.PREVIEW_CONCURRENCY_PATH;
const coherentTuples = (__ENV.PREVIEW_COHERENT_TUPLES || "").split(",").filter(Boolean);
const expectedAuditCount = Number(__ENV.PREVIEW_EXPECTED_AUDIT_COUNT || "0");
const runId = __ENV.PREVIEW_RUN_ID || "local";
const selected = __ENV.PREVIEW_SCENARIO;
const warmup = __ENV.PREVIEW_WARMUP_DURATION || "15s";
const measured = __ENV.PREVIEW_MEASURE_DURATION || "60s";

function scenario(rate, exec) {
  return {
    executor: "ramping-arrival-rate",
    startRate: Math.max(1, Math.ceil(rate / 10)),
    timeUnit: "1s",
    preAllocatedVUs: 30,
    maxVUs: 300,
    stages: [
      { target: rate, duration: warmup },
      { target: rate, duration: measured },
    ],
    exec,
  };
}

const definitions = {
  current_capacity: scenario(Number(__ENV.PREVIEW_CURRENT_RATE || "75"), "currentCapacity"),
  revision_capacity: scenario(Number(__ENV.PREVIEW_REVISION_RATE || "50"), "revisionCapacity"),
  intentional_429: scenario(Number(__ENV.PREVIEW_RATE_LIMIT_RATE || "15"), "rateLimit"),
  redis_outage: scenario(Number(__ENV.PREVIEW_OUTAGE_RATE || "50"), "redisOutage"),
  oversized_response: scenario(Number(__ENV.PREVIEW_BOUNDARY_RATE || "5"), "largeResponse"),
  concurrent_save_read: scenario(Number(__ENV.PREVIEW_CONCURRENCY_RATE || "75"), "concurrentRead"),
  parallel_audit: {
    executor: "shared-iterations",
    vus: Number(__ENV.PREVIEW_AUDIT_VUS || "50"),
    iterations: expectedAuditCount,
    maxDuration: __ENV.PREVIEW_AUDIT_MAX_DURATION || "60s",
    exec: "parallelAudit",
  },
};
if (!Object.hasOwn(definitions, selected)) throw new Error("Select one approved Preview profile.");

const thresholds = { preview_unexpected_errors: ["rate<0.005"], dropped_iterations: ["count==0"] };
if (selected === "current_capacity") thresholds.preview_duration = ["p(95)<=100", "p(99)<=200"];
else if (selected === "revision_capacity")
  thresholds.preview_duration = ["p(95)<=125", "p(99)<=250"];
else if (selected === "intentional_429") {
  thresholds.preview_intentional_429_ratio = ["rate>0.25"];
  thresholds.preview_status_429 = ["count>0"];
  thresholds.preview_status_429_primary = ["count>0"];
  thresholds.preview_status_429_secondary = ["count>0"];
  thresholds.preview_status_2xx = ["count>0"];
} else if (selected === "redis_outage") thresholds.preview_duration = ["p(95)<=500", "p(99)<=750"];
else if (selected !== "parallel_audit") thresholds.preview_duration = ["p(95)<=250", "p(99)<=500"];
if (selected === "concurrent_save_read") thresholds.preview_coherence_errors = ["rate==0"];
if (selected === "parallel_audit") thresholds.preview_status_2xx = [`count==${expectedAuditCount}`];
if (selected === "oversized_response") thresholds.preview_status_413 = ["count>0"];

export const options = { scenarios: { [selected]: definitions[selected] }, thresholds };

function durationMs(value) {
  const match = /^(\d+)(ms|s|m)$/.exec(value);
  if (!match) throw new Error("Durations must use integer ms, s, or m units.");
  return Number(match[1]) * (match[2] === "m" ? 60_000 : match[2] === "s" ? 1_000 : 1);
}
function measuredPhase() {
  if (selected === "parallel_audit") return true;
  const elapsed = Date.now() - execution.scenario.startTime;
  return elapsed >= durationMs(warmup) && elapsed < durationMs(warmup) + durationMs(measured);
}
function credential(distributed) {
  const index = distributed ? execution.scenario.iterationInTest % credentials.length : 0;
  return credentials[index];
}
function requirePreviewPath(path, name) {
  if (!path || !path.startsWith("/api/preview/v1/") || path.includes("#")) {
    throw new Error(`${name} must be an absolute Preview API path without a fragment.`);
  }
  const query = path.split("?", 2)[1] || "";
  const credentialNames = new Set(["token", "key", "credential", "authorization"]);
  for (const parameter of query.split("&")) {
    if (!parameter) continue;
    let key;
    try {
      key = decodeURIComponent(parameter.split("=", 1)[0]).toLowerCase();
    } catch {
      throw new Error(`${name} contains malformed query encoding.`);
    }
    if (credentialNames.has(key)) {
      throw new Error(`${name} must never contain credential material.`);
    }
  }
}
function requestOptions(distributed) {
  return {
    headers: {
      Authorization: `Bearer ${credential(distributed)}`,
      "X-Request-Id": `preview.load.${measuredPhase() ? "measured" : "warmup"}-${selected}-${runId}-${execution.scenario.iterationInTest}`,
    },
    redirects: 0,
  };
}
function header(response, name) {
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1];
}
function isolated(response) {
  return (
    header(response, "cache-control") === "private, no-store, max-age=0" &&
    header(response, "pragma") === "no-cache" &&
    header(response, "expires") === "0" &&
    header(response, "referrer-policy") === "no-referrer" &&
    header(response, "etag") === undefined &&
    header(response, "last-modified") === undefined
  );
}
function record(response, accepted, name) {
  const valid = accepted.includes(response.status) && isolated(response);
  if (measuredPhase()) {
    latency.add(response.timings.duration);
    errors.add(!valid);
    if (response.status >= 200 && response.status < 300) ok.add(1);
    else if (response.status === 429) limited.add(1);
    else if (response.status === 413) oversized.add(1);
  }
  check(response, {
    [name]: () => accepted.includes(response.status),
    "no-store isolation": () => isolated(response),
  });
}
function at(paths) {
  return paths[(execution.scenario.iterationInTest + __VU) % paths.length];
}
function get(url, path, distributed) {
  return http.get(`${url}${path}`, requestOptions(distributed));
}

export function setup() {
  if (!baseUrl || credentials.length === 0 || currentPaths.length === 0)
    throw new Error("Base URL, compliant credentials, and current paths are required.");
  currentPaths.forEach((path) => requirePreviewPath(path, "Current path"));
  revisionPaths.forEach((path) => requirePreviewPath(path, "Revision path"));
  if (selected === "revision_capacity" && revisionPaths.length === 0)
    throw new Error("Revision paths are required.");
  if (selected === "intentional_429" && !secondaryUrl)
    throw new Error("Second server is required.");
  if (selected === "oversized_response" && !oversizedPath)
    throw new Error("Prepared oversized path is required.");
  if (oversizedPath) requirePreviewPath(oversizedPath, "Oversized path");
  if (selected === "concurrent_save_read" && (!concurrencyPath || coherentTuples.length === 0))
    throw new Error(
      "Concurrent save/read requires one fixture path and committed tuple allowlist.",
    );
  if (concurrencyPath) requirePreviewPath(concurrencyPath, "Concurrency path");
  if (
    selected === "parallel_audit" &&
    (!Number.isInteger(expectedAuditCount) || expectedAuditCount < 1 || expectedAuditCount > 10_000)
  )
    throw new Error("Parallel audit requires PREVIEW_EXPECTED_AUDIT_COUNT from 1 through 10000.");
}

export function currentCapacity() {
  const path = at(currentPaths);
  const response =
    execution.scenario.iterationInTest % 10 === 0
      ? http.head(`${baseUrl}${path}`, requestOptions(true))
      : get(baseUrl, path, true);
  record(response, [200], "current Preview succeeds");
}
export function revisionCapacity() {
  record(get(baseUrl, at(revisionPaths), true), [200], "revision Preview succeeds");
}
export function redisOutage() {
  record(get(baseUrl, at(currentPaths), true), [200], "Preview survives Redis outage");
}
export function concurrentRead() {
  const response = get(baseUrl, concurrencyPath, true);
  record(response, [200], "concurrent Preview remains available");
  const schemaRevisionId =
    response.status === 200 ? response.json("data.preview.schemaRevisionId") : null;
  const sharedRevisionId =
    response.status === 200 ? response.json("data.preview.sharedRevisionId") : null;
  const localizedRevisionId =
    response.status === 200 ? response.json("data.preview.localizedRevisionId") : null;
  const tuple = schemaRevisionId
    ? `${schemaRevisionId}|${sharedRevisionId || "none"}|${localizedRevisionId || "none"}`
    : "invalid";
  const coherent = response.status === 200 && coherentTuples.includes(tuple);
  if (measuredPhase()) coherenceErrors.add(!coherent);
  check(response, { "Preview source tuple was atomically committed": () => coherent });
}
export function parallelAudit() {
  record(get(baseUrl, at(currentPaths), true), [200], "audited Preview succeeds");
}
export function largeResponse() {
  const response = get(baseUrl, oversizedPath, true);
  record(response, [413], "oversized Preview is rejected");
  check(response, {
    "stable size error": () => response.json("error.code") === "PREVIEW_RESPONSE_TOO_LARGE",
  });
}
export function rateLimit() {
  const secondary = execution.scenario.iterationInTest % 2 === 1;
  const response = get(secondary ? secondaryUrl : baseUrl, at(currentPaths), false);
  const accepted = response.status === 200 || response.status === 429;
  if (measuredPhase()) {
    latency.add(response.timings.duration);
    errors.add(!accepted || !isolated(response));
    intentional429.add(response.status === 429);
    if (response.status === 200) ok.add(1);
    if (response.status === 429) {
      limited.add(1);
      if (secondary) limitedSecondary.add(1);
      else limitedPrimary.add(1);
    }
  }
  check(response, {
    "shared identity returns 200 or 429": () => accepted,
    "429 contract is stable": () =>
      response.status !== 429 ||
      (header(response, "ratelimit-limit") === "300" &&
        Number(header(response, "retry-after")) >= 1 &&
        response.json("error.code") === "RATE_LIMITED"),
    "no-store isolation": () => isolated(response),
  });
}
