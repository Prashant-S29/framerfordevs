// Exercises the approved M9 Delivery capacity, limiter, revalidation, and response-boundary gates.

import http from "k6/http";
import execution from "k6/execution";
import { check } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const latestLatency = new Trend("delivery_latest_duration", true);
const listLatency = new Trend("delivery_list_duration", true);
const expansionLatency = new Trend("delivery_expansion_duration", true);
const revalidationLatency = new Trend("delivery_revalidation_duration", true);
const outageLatency = new Trend("delivery_outage_duration", true);
const boundaryLatency = new Trend("delivery_boundary_duration", true);
const unexpectedErrors = new Rate("delivery_unexpected_errors");
const intentionalRateLimited = new Rate("delivery_intentional_429_ratio");
const successfulResponses = new Counter("delivery_status_2xx");
const notModifiedResponses = new Counter("delivery_status_304");
const rateLimitedResponses = new Counter("delivery_status_429");
const credentialRateLimitedResponses = new Counter("delivery_status_429_credential");
const primaryRateLimitedResponses = new Counter("delivery_status_429_primary");
const secondaryRateLimitedResponses = new Counter("delivery_status_429_secondary");
const globalRateLimitedResponses = new Counter("delivery_status_429_global");
const oversizedResponses = new Counter("delivery_status_413");
const invalidResponses = new Counter("delivery_status_400");
const unauthorizedResponses = new Counter("delivery_status_401");
const notFoundResponses = new Counter("delivery_status_404");
const unavailableResponses = new Counter("delivery_status_503");
const serverErrorResponses = new Counter("delivery_status_5xx");
const failedResponses = new Counter("delivery_status_other");

const baseUrl = __ENV.DELIVERY_BASE_URL;
const secondaryBaseUrl = __ENV.DELIVERY_SECONDARY_BASE_URL;
const projectId = __ENV.DELIVERY_PROJECT_ID;
const environmentKey = __ENV.DELIVERY_ENVIRONMENT_KEY;
const collectionKey = __ENV.DELIVERY_COLLECTION_KEY;
const locale = __ENV.DELIVERY_LOCALE || "en";
const entryIds = (__ENV.DELIVERY_ENTRY_IDS || "").split(",").filter(Boolean);
const uniqueValues = (__ENV.DELIVERY_UNIQUE_VALUES || "").split(",").filter(Boolean);
const credentials = (__ENV.DELIVERY_CREDENTIALS || "").split(",").filter(Boolean);
const filterValue = __ENV.DELIVERY_FILTER_VALUE;
const selectedScenario = __ENV.DELIVERY_SCENARIO;
const warmupDuration = __ENV.DELIVERY_WARMUP_DURATION || "15s";
const measuredDuration = __ENV.DELIVERY_MEASURE_DURATION || "60s";
const mixedRate = Number(__ENV.DELIVERY_MIXED_RATE || "200");
const listRate = Number(__ENV.DELIVERY_LIST_RATE || "100");
const expansionRate = Number(__ENV.DELIVERY_EXPANSION_RATE || "25");
const rateLimitRate = Number(__ENV.DELIVERY_RATE_LIMIT_RATE || "30");
const outageRate = Number(__ENV.DELIVERY_OUTAGE_RATE || "50");
const revalidationRate = Number(__ENV.DELIVERY_REVALIDATION_RATE || "100");
const boundaryRate = Number(__ENV.DELIVERY_BOUNDARY_RATE || "5");

function deliveryRoot(url) {
  return `${url}/api/delivery/v1/projects/${projectId}/environments/${environmentKey}/collections/${collectionKey}`;
}

function arrivalScenario(rate, exec, workload, preAllocatedVUs, maxVUs) {
  return {
    executor: "ramping-arrival-rate",
    startRate: Math.min(rate, Math.max(1, Math.ceil(rate / 10))),
    timeUnit: "1s",
    preAllocatedVUs,
    maxVUs,
    stages: [
      { target: rate, duration: warmupDuration },
      { target: rate, duration: measuredDuration },
    ],
    exec,
    tags: { workload },
  };
}

const scenarioDefinitions = {
  mixed_latest_unique: arrivalScenario(200, "mixedLatestUnique", "latest_unique", 50, 600),
  indexed_list: arrivalScenario(100, "indexedList", "indexed_list", 30, 400),
  pinned_expansion: arrivalScenario(25, "pinnedExpansion", "expansion", 20, 200),
  intentional_429: arrivalScenario(rateLimitRate, "intentional429", "intentional_429", 30, 200),
  redis_outage: arrivalScenario(outageRate, "redisOutage", "redis_outage", 30, 300),
  conditional_304: arrivalScenario(revalidationRate, "conditional304", "conditional_304", 30, 300),
  large_response: arrivalScenario(boundaryRate, "largeResponse", "large_response", 10, 100),
};
scenarioDefinitions.mixed_latest_unique.stages[0].target = mixedRate;
scenarioDefinitions.mixed_latest_unique.stages[1].target = mixedRate;
scenarioDefinitions.indexed_list.stages[0].target = listRate;
scenarioDefinitions.indexed_list.stages[1].target = listRate;
scenarioDefinitions.pinned_expansion.stages[0].target = expansionRate;
scenarioDefinitions.pinned_expansion.stages[1].target = expansionRate;

if (!Object.hasOwn(scenarioDefinitions, selectedScenario)) {
  throw new Error("DELIVERY_SCENARIO must select one approved workload.");
}

const thresholds = {
  delivery_unexpected_errors: ["rate<0.005"],
  dropped_iterations: ["count==0"],
};
if (selectedScenario === "mixed_latest_unique") {
  thresholds.delivery_latest_duration = ["p(95)<=75", "p(99)<=150"];
} else if (selectedScenario === "indexed_list") {
  thresholds.delivery_list_duration = ["p(95)<=150", "p(99)<=300"];
} else if (selectedScenario === "pinned_expansion") {
  thresholds.delivery_expansion_duration = ["p(95)<=250", "p(99)<=500"];
} else if (selectedScenario === "intentional_429") {
  thresholds.delivery_intentional_429_ratio = ["rate>0.5"];
  thresholds.delivery_status_429_credential = ["count>0"];
  thresholds.delivery_status_429_primary = ["count>0"];
  thresholds.delivery_status_429_secondary = ["count>0"];
  thresholds.delivery_status_2xx = ["count>0"];
} else if (selectedScenario === "redis_outage") {
  thresholds.delivery_outage_duration = ["p(95)<=500", "p(99)<=750"];
} else if (selectedScenario === "conditional_304") {
  thresholds.delivery_revalidation_duration = ["p(95)<=75", "p(99)<=150"];
  thresholds.delivery_status_304 = ["count>0"];
} else if (selectedScenario === "large_response") {
  thresholds.delivery_boundary_duration = ["p(95)<=250", "p(99)<=500"];
  thresholds.delivery_status_413 = ["count>0"];
}

export const options = {
  scenarios: { [selectedScenario]: scenarioDefinitions[selectedScenario] },
  thresholds,
};

function durationMilliseconds(value) {
  const match = /^(\d+)(ms|s|m)$/.exec(value);
  if (!match) throw new Error("Load durations must use integer ms, s, or m units.");
  const amount = Number(match[1]);
  return amount * (match[2] === "m" ? 60_000 : match[2] === "s" ? 1_000 : 1);
}

function isMeasuredPhase() {
  return Date.now() - execution.scenario.startTime >= durationMilliseconds(warmupDuration);
}

function requestOptions(credentialIndex, extraHeaders = {}) {
  const credential = credentials[credentialIndex % credentials.length];
  return credential === undefined
    ? { headers: extraHeaders, tags: { authenticated: "false" } }
    : {
        headers: { ...extraHeaders, Authorization: `Bearer ${credential}` },
        tags: { authenticated: "true" },
      };
}

function distributedCredentialIndex() {
  if (credentials.length <= 1) return 0;
  return 1 + (execution.scenario.iterationInTest % (credentials.length - 1));
}

function responseHeader(response, name) {
  const target = name.toLowerCase();
  const match = Object.entries(response.headers).find(([key]) => key.toLowerCase() === target);
  return match?.[1];
}

function recordStatus(response) {
  if (response.status >= 200 && response.status < 300) successfulResponses.add(1);
  else if (response.status === 304) notModifiedResponses.add(1);
  else if (response.status === 429) {
    rateLimitedResponses.add(1);
    const limit = responseHeader(response, "RateLimit-Limit");
    if (limit === "600") credentialRateLimitedResponses.add(1);
    else if (limit === "30000") globalRateLimitedResponses.add(1);
  } else if (response.status === 413) oversizedResponses.add(1);
  else if (response.status === 400) invalidResponses.add(1);
  else if (response.status === 401) unauthorizedResponses.add(1);
  else if (response.status === 404) notFoundResponses.add(1);
  else if (response.status === 503) unavailableResponses.add(1);
  else if (response.status >= 500) serverErrorResponses.add(1);
  else failedResponses.add(1);
}

function record(response, trend, acceptedStatuses, checkName) {
  const accepted = acceptedStatuses.includes(response.status);
  if (isMeasuredPhase()) {
    trend.add(response.timings.duration);
    unexpectedErrors.add(!accepted);
    recordStatus(response);
  }
  check(response, { [checkName]: () => accepted });
}

export function setup() {
  if (!baseUrl || !projectId || !environmentKey || !collectionKey) {
    throw new Error("Delivery load authority is incomplete.");
  }
  if (entryIds.length === 0 || uniqueValues.length === 0 || !filterValue) {
    throw new Error("Delivery load fixture identifiers are incomplete.");
  }
  if (credentials.length === 0) {
    throw new Error("The protected Delivery load fixture requires credentials.");
  }
  if (selectedScenario === "intentional_429" && !secondaryBaseUrl) {
    throw new Error("The 429 gate requires a second server process URL.");
  }
  if (selectedScenario !== "conditional_304") return {};

  const path = `${deliveryRoot(baseUrl)}/entries/${entryIds[0]}?locale=${encodeURIComponent(locale)}`;
  const response = http.get(path, requestOptions(1));
  const etag = response.headers.Etag;
  if (response.status !== 200 || !etag) {
    throw new Error("Conditional revalidation setup could not acquire an ETag.");
  }
  return { etag, path };
}

export function mixedLatestUnique() {
  const index = (__VU + __ITER) % entryIds.length;
  const root = deliveryRoot(baseUrl);
  const path =
    __ITER % 2 === 0
      ? `${root}/entries/${entryIds[index]}?locale=${encodeURIComponent(locale)}`
      : `${root}/entries/by/slug?locale=${encodeURIComponent(locale)}&value=${encodeURIComponent(uniqueValues[index % uniqueValues.length])}`;
  record(
    http.get(path, requestOptions(execution.scenario.iterationInTest)),
    latestLatency,
    [200],
    "Delivery response is successful",
  );
}

export function indexedList() {
  const query = `locale=${encodeURIComponent(locale)}&limit=20&filter.title.eq=${encodeURIComponent(filterValue)}&sort=title`;
  record(
    http.get(
      `${deliveryRoot(baseUrl)}/entries?${query}`,
      requestOptions(execution.scenario.iterationInTest),
    ),
    listLatency,
    [200],
    "Delivery response is successful",
  );
}

export function pinnedExpansion() {
  const entryId = entryIds[(__VU + __ITER) % entryIds.length];
  const query = `locale=${encodeURIComponent(locale)}&expand=related_entry`;
  record(
    http.get(
      `${deliveryRoot(baseUrl)}/entries/${entryId}?${query}`,
      requestOptions(execution.scenario.iterationInTest),
    ),
    expansionLatency,
    [200],
    "Delivery response is successful",
  );
}

export function intentional429() {
  const useSecondary = secondaryBaseUrl && execution.scenario.iterationInTest % 2 === 1;
  const root = deliveryRoot(useSecondary ? secondaryBaseUrl : baseUrl);
  const index = (__VU + __ITER) % entryIds.length;
  const weighted = __ITER % 2 === 1;
  const path = weighted
    ? `${root}/entries?locale=${encodeURIComponent(locale)}&limit=50`
    : `${root}/entries/${entryIds[index]}?locale=${encodeURIComponent(locale)}`;
  const response = http.get(path, requestOptions(0));
  const accepted = response.status === 200 || response.status === 429;
  if (isMeasuredPhase()) {
    latestLatency.add(response.timings.duration);
    unexpectedErrors.add(!accepted);
    intentionalRateLimited.add(response.status === 429);
    recordStatus(response);
    if (response.status === 429) {
      if (useSecondary) secondaryRateLimitedResponses.add(1);
      else primaryRateLimitedResponses.add(1);
    }
  }
  const responseBody = response.status === 429 ? response.json() : null;
  const valid429 =
    response.status !== 429 ||
    (responseHeader(response, "RateLimit-Limit") === "600" &&
      Number(responseHeader(response, "RateLimit-Remaining")) >= 0 &&
      Number(responseHeader(response, "RateLimit-Remaining")) < 600 &&
      Number(responseHeader(response, "Retry-After")) >= 1 &&
      Number(responseHeader(response, "RateLimit-Reset")) > 0 &&
      responseBody?.error?.code === "RATE_LIMITED");
  check(response, {
    "Hot identity returns only success or intentional 429": () => accepted,
    "Intentional 429 has the stable credential quota contract": () => valid429,
  });
}

export function redisOutage() {
  const index = (__VU + __ITER) % entryIds.length;
  const path = `${deliveryRoot(baseUrl)}/entries/${entryIds[index]}?locale=${encodeURIComponent(locale)}`;
  record(
    http.get(path, requestOptions(distributedCredentialIndex())),
    outageLatency,
    [200],
    "Delivery remains available through Redis outage and recovery",
  );
}

export function conditional304(data) {
  record(
    http.get(
      data.path,
      requestOptions(distributedCredentialIndex(), { "If-None-Match": data.etag }),
    ),
    revalidationLatency,
    [304],
    "Conditional Delivery response is not modified",
  );
}

export function largeResponse() {
  const query = `locale=${encodeURIComponent(locale)}&limit=50&filter.title.eq=${encodeURIComponent("M9 Oversized Boundary")}`;
  const path = `${deliveryRoot(baseUrl)}/entries?${query}`;
  const response = http.get(path, requestOptions(distributedCredentialIndex()));
  record(response, boundaryLatency, [413], "Oversized Delivery page is rejected");
  check(response, {
    "Oversized response uses the stable error contract": () =>
      response.status !== 413 || response.json("error.code") === "DELIVERY_RESPONSE_TOO_LARGE",
  });
}
