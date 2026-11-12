import { randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CaptureRecord, ScenarioKey } from "./types.js";

const safeIdentityPattern = /^[0-9a-f-]{36}$/u;

export interface CaptureLocation {
  readonly absolutePath: string;
}

function safeIdentity(value: string | null, fallback: string): string {
  return value !== null && safeIdentityPattern.test(value) ? value : fallback;
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporaryPath, path);
}

export async function createCapture(
  dataDirectory: string,
  record: CaptureRecord,
): Promise<CaptureLocation> {
  const date = new Date(record.receivedAt);
  const eventId = safeIdentity(record.headers.webhookId, "invalid-event");
  const deliveryId = safeIdentity(record.headers.webhookDeliveryId, "invalid-delivery");
  const attemptId = safeIdentity(record.headers.webhookAttemptId, "invalid-attempt");
  const attemptNumber = record.headers.webhookAttemptNumber ?? 0;
  const path = join(
    dataDirectory,
    "captures",
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    record.scenario,
    eventId,
    deliveryId,
    `${String(attemptNumber).padStart(2, "0")}--${attemptId}--${record.captureId}.json`,
  );
  await writeJsonAtomically(path, record);
  return { absolutePath: path };
}

export async function finalizeCapture(
  location: CaptureLocation,
  record: CaptureRecord,
): Promise<void> {
  await writeJsonAtomically(location.absolutePath, record);
}

export async function reserveAcceptedEvent(
  dataDirectory: string,
  scenario: ScenarioKey,
  eventId: string,
  acceptedAt: string,
): Promise<boolean> {
  const safeEventId = safeIdentity(eventId, "invalid-event");
  const path = join(dataDirectory, "state", "accepted", scenario, `${safeEventId}.json`);
  await mkdir(dirname(path), { recursive: true });
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ acceptedAt })}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST") {
      return false;
    }
    throw new Error("Accepted-event state is unavailable.", { cause });
  }
}
