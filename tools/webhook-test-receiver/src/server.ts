// Hosts the bounded signed-webhook receiver and persists safe real-network attempt evidence.

import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import { loadScenarioSecrets } from "./config.js";
import { planScenario, planVerificationFailure } from "./scenarios.js";
import { verifyWebhook } from "./signature.js";
import { createCapture, finalizeCapture, reserveAcceptedEvent } from "./storage.js";
import {
  scenarioKeys,
  type CaptureRecord,
  type RuntimeConfig,
  type SafeWebhookHeaders,
  type ScenarioKey,
} from "./types.js";

const scenarioSet = new Set<string>(scenarioKeys);

/** Returns one singleton request-header value without accepting ambiguous duplicates. */
function singletonHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}

/** Parses the positive attempt number used by deterministic retry scenarios. */
function attemptNumber(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 99 ? parsed : null;
}

/** Parses the fixed boolean replay marker without coercing arbitrary strings. */
function replayMarker(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** Selects only non-secret headers that are safe to persist and report. */
function safeHeaders(request: IncomingMessage): SafeWebhookHeaders {
  return {
    contentType: singletonHeader(request, "content-type"),
    contentLength: singletonHeader(request, "content-length"),
    userAgent: singletonHeader(request, "user-agent"),
    webhookId: singletonHeader(request, "webhook-id"),
    webhookTimestamp: singletonHeader(request, "webhook-timestamp"),
    webhookDeliveryId: singletonHeader(request, "webhook-delivery-id"),
    webhookAttemptId: singletonHeader(request, "webhook-attempt-id"),
    webhookAttemptNumber: attemptNumber(singletonHeader(request, "webhook-attempt-number")),
    webhookReplay: replayMarker(singletonHeader(request, "webhook-replay")),
  };
}

/** Reads one request body while aborting as soon as the configured byte bound is crossed. */
async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const chunks: Array<Buffer> = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumBytes) throw new Error("request_too_large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

/** Sends one bounded JSON response, omitting the body for successful no-content scenarios. */
function sendResponse(response: ServerResponse, status: number, code: string): void {
  if (response.destroyed) return;
  if (status === 204) {
    response.writeHead(status).end();
    return;
  }
  const body = Buffer.from(
    `${JSON.stringify({ ok: status >= 200 && status < 300, code })}\n`,
    "utf8",
  );
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

/** Handles one verified scenario request from raw bytes through durable terminal capture. */
async function handleWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  scenario: ScenarioKey,
  config: RuntimeConfig,
): Promise<void> {
  const startedAt = Date.now();
  const receivedAt = new Date(startedAt).toISOString();
  let body: Buffer;
  try {
    body = await readBody(request, config.maximumBodyBytes);
  } catch {
    sendResponse(response, 413, "request_too_large");
    return;
  }
  const headers = safeHeaders(request);
  const secrets = await loadScenarioSecrets(config.secretsDir, scenario);
  const verification = verifyWebhook({
    webhookId: headers.webhookId,
    webhookTimestamp: headers.webhookTimestamp,
    webhookSignature: singletonHeader(request, "webhook-signature"),
    body,
    secrets,
    nowEpochSeconds: Math.floor(Date.now() / 1_000),
    toleranceSeconds: config.timestampToleranceSeconds,
  });
  const planned = verification.ok
    ? planScenario(scenario, headers.webhookAttemptNumber ?? 1)
    : planVerificationFailure(verification.category);
  let duplicateAcceptedEvent = false;
  if (verification.ok && verification.event !== undefined && planned.acceptsEvent) {
    duplicateAcceptedEvent = !(await reserveAcceptedEvent(
      config.dataDir,
      scenario,
      verification.event.id,
      receivedAt,
    ));
  }
  const responsePlan =
    scenario === "idempotent" && duplicateAcceptedEvent
      ? { ...planned, status: 200, code: "duplicate_noop" }
      : planned;
  const baseRecord: CaptureRecord = {
    schemaVersion: 1,
    captureId: randomUUID(),
    phase: "received",
    receivedAt,
    completedAt: null,
    scenario,
    bodyBytes: body.byteLength,
    bodySha256: createHash("sha256").update(body).digest("hex"),
    headers,
    verification: {
      ok: verification.ok,
      category: verification.category,
      duplicateAcceptedEvent,
    },
    event: verification.event ?? null,
    response: responsePlan,
  };
  const location = await createCapture(config.dataDir, baseRecord);
  if (responsePlan.delayMs > 0) await sleep(responsePlan.delayMs);
  if (responsePlan.retryAfter !== null && !response.destroyed) {
    response.setHeader("retry-after", responsePlan.retryAfter);
  }
  if (responsePlan.location !== null && !response.destroyed) {
    response.setHeader("location", responsePlan.location);
  }
  const disconnected = request.socket.destroyed || response.destroyed;
  const completedAt = new Date().toISOString();
  await finalizeCapture(location, {
    ...baseRecord,
    phase: disconnected ? "client_disconnected" : "responded",
    completedAt,
  });
  if (!disconnected) sendResponse(response, responsePlan.status, responsePlan.code);
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      event: "webhook.received",
      scenario,
      verification: verification.category,
      status: responsePlan.status,
      bodyBytes: body.byteLength,
      durationMs: Date.now() - startedAt,
    })}\n`,
  );
}

/** Resolves a public hook path to the closed scenario registry. */
function scenarioFromPath(pathname: string): ScenarioKey | null {
  const prefix = "/hooks/";
  if (!pathname.startsWith(prefix)) return null;
  const key = pathname.slice(prefix.length);
  if (!scenarioSet.has(key)) return null;
  for (const scenario of scenarioKeys) if (scenario === key) return scenario;
  return null;
}

/** Creates the HTTP server while keeping configuration and secret loading injectable for tests. */
export function createReceiverServer(config: RuntimeConfig): Server {
  return createServer((request, response) => {
    const run = async (): Promise<void> => {
      const url = new URL(request.url ?? "/", "http://receiver.local");
      if (
        request.method === "GET" &&
        (url.pathname === "/health/live" || url.pathname === "/health/ready")
      ) {
        sendResponse(response, 200, "ready");
        return;
      }
      const scenario = scenarioFromPath(url.pathname);
      if (request.method !== "POST" || scenario === null) {
        sendResponse(response, 404, "not_found");
        return;
      }
      if (!singletonHeader(request, "content-type")?.startsWith("application/cloudevents+json")) {
        sendResponse(response, 415, "unsupported_media_type");
        return;
      }
      await handleWebhook(request, response, scenario, config);
    };
    run().catch(() => {
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "webhook.receiver.failure" })}\n`,
      );
      sendResponse(response, 500, "internal_error");
    });
  });
}
