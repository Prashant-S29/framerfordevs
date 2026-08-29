// Parses the persistent server/worker webhook encryption key-ring contract without exposing key bytes.

export interface ParsedWebhookKeyRing {
  readonly activeKeyId: string;
  readonly keys: Readonly<Record<string, string>>;
}

export function parseWebhookKeyRing(
  activeKeyId: string | undefined,
  encodedRing: string | undefined,
): ParsedWebhookKeyRing | null {
  if (activeKeyId === undefined && encodedRing === undefined) return null;
  if (activeKeyId === undefined || encodedRing === undefined) {
    throw new Error("Webhook encryption key-ring configuration is incomplete.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedRing);
  } catch {
    throw new Error("Webhook encryption key-ring configuration is malformed.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Webhook encryption key-ring configuration must be an object.");
  }
  const keys: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(id) ||
      typeof value !== "string" ||
      Buffer.from(value, "base64url").length !== 32 ||
      Buffer.from(value, "base64url").toString("base64url") !== value
    ) {
      throw new Error("Webhook encryption key-ring configuration contains an invalid key.");
    }
    keys[id] = value;
  }
  if (!(activeKeyId in keys)) throw new Error("The active webhook encryption key is missing.");
  return { activeKeyId, keys };
}
