// Sends one synthetic signed content-free event through a configured public tunnel without printing authority.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const secretPattern = /^whsec_[A-Za-z0-9_-]{43}$/u;

/** Reads the single local success-scenario secret used only by this opt-in smoke command. */
async function readSuccessSecret(): Promise<string> {
  const entries = (await readFile("secrets/success.txt", "utf8"))
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const secret = entries[0];
  if (entries.length !== 1 || secret === undefined || !secretPattern.test(secret)) {
    throw new Error("The smoke test requires exactly one valid secrets/success.txt value.");
  }
  return secret;
}

/** Parses the public tunnel origin without accepting credentials, ports, or paths. */
function publicOrigin(): URL {
  const raw = process.env.PUBLIC_BASE_URL;
  if (raw === undefined) throw new Error("Set PUBLIC_BASE_URL to the tunnel HTTPS origin.");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("PUBLIC_BASE_URL must be an HTTPS default-port hostname origin.");
  }
  return url;
}

/** Creates one complete synthetic event using no application content or durable identity. */
function smokeEvent(eventId: string) {
  const projectId = randomUUID();
  const environmentId = randomUUID();
  const collectionId = randomUUID();
  const entryId = randomUUID();
  return {
    specversion: "1.0",
    id: eventId,
    source: `urn:framerfordevs:project:${projectId}:environment:${environmentId}`,
    type: "cms.entry.published",
    subject: `cms.entry/${entryId}`,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    data: {
      version: 1,
      projectId,
      environmentId,
      collectionId,
      entryId,
      locale: { id: randomUUID(), tag: "en" },
      publication: { id: randomUUID(), sequence: 1 },
      aggregate: { type: "cms.entry", id: entryId, sequence: 1 },
      schema: { revisionId: randomUUID(), contractHash: randomBytes(32).toString("hex") },
      changes: { fieldIds: [] },
      invalidation: { systemTags: [], semanticTags: [], routes: [] },
    },
  };
}

/** Executes the public signed request and reports only its terminal status. */
async function main(): Promise<void> {
  const origin = publicOrigin();
  const secret = await readSuccessSecret();
  const eventId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1_000);
  const body = Buffer.from(JSON.stringify(smokeEvent(eventId)), "utf8");
  const key = Buffer.from(secret.slice(6), "base64url");
  const signature = createHmac("sha256", key)
    .update(Buffer.concat([Buffer.from(`${eventId}.${timestamp}.`, "utf8"), body]))
    .digest("base64");
  const response = await fetch(new URL("/hooks/success", origin), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/cloudevents+json; charset=utf-8",
      "content-length": String(body.byteLength),
      "user-agent": "FramerForDevs-Webhook-Smoke/1",
      "webhook-id": eventId,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
      "webhook-delivery-id": randomUUID(),
      "webhook-attempt-id": randomUUID(),
      "webhook-attempt-number": "1",
      "webhook-replay": "false",
    },
    body,
  });
  if (response.status !== 204) throw new Error("The public signed smoke request was rejected.");
  process.stdout.write(`${JSON.stringify({ delivered: true, status: response.status })}\n`);
}

await main();
