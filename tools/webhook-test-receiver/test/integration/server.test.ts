// Exercises the real Node HTTP boundary through signature verification, response completion, and capture persistence.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createReceiverServer } from "../../src/server.js";
import { testBody, testEventId, testSecret, testSignature } from "../support/helpers.js";

const deliveryId = "019fae8b-1234-7000-8000-000000000007";
const attemptId = "019fae8b-1234-7000-8000-000000000008";

/** Starts one isolated receiver and returns its assigned loopback port. */
async function listen(server: ReturnType<typeof createReceiverServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Test server address unavailable.");
  return address.port;
}

/** Closes one test server without leaking a listening socket. */
async function close(server: ReturnType<typeof createReceiverServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => (cause === undefined ? resolve() : reject(cause)));
  });
}

test("returns 204 and records responded for a verified success request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ffd-webhook-server-"));
  const secretsDirectory = join(directory, "secrets");
  const dataDirectory = join(directory, "data");
  await mkdir(secretsDirectory, { recursive: true });
  await writeFile(join(secretsDirectory, "success.txt"), `${testSecret}\n`, { mode: 0o600 });
  const server = createReceiverServer({
    port: 8_787,
    dataDir: dataDirectory,
    secretsDir: secretsDirectory,
    maximumBodyBytes: 131_072,
    timestampToleranceSeconds: 300,
  });
  try {
    const port = await listen(server);
    const body = testBody();
    const timestamp = Math.floor(Date.now() / 1_000);
    const response = await fetch(`http://127.0.0.1:${port}/hooks/success`, {
      method: "POST",
      headers: {
        "content-type": "application/cloudevents+json; charset=utf-8",
        "webhook-id": testEventId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": testSignature(timestamp, body),
        "webhook-delivery-id": deliveryId,
        "webhook-attempt-id": attemptId,
        "webhook-attempt-number": "1",
        "webhook-replay": "false",
      },
      body: body.toString("utf8"),
    });
    assert.equal(response.status, 204);
    const captureDate = new Date();
    const captureDirectory = join(
      dataDirectory,
      "captures",
      captureDate.getUTCFullYear().toString(),
      String(captureDate.getUTCMonth() + 1).padStart(2, "0"),
      String(captureDate.getUTCDate()).padStart(2, "0"),
      "success",
      testEventId,
      deliveryId,
    );
    const files = await readdir(captureDirectory);
    assert.equal(files.length, 1);
    const stored = await readFile(join(captureDirectory, files[0] ?? "missing"), "utf8");
    assert.match(stored, /"phase": "responded"/u);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
