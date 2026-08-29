// Verifies strict persistent key-ring parsing without exposing or normalizing key material.

import { assert, describe, it } from "@effect/vitest";

import { parseWebhookKeyRing } from "./index";

const key = Buffer.alloc(32, 7).toString("base64url");

describe("webhook key-ring configuration", () => {
  it("accepts one explicit active key and preserves exact IDs", () => {
    assert.deepStrictEqual(parseWebhookKeyRing("active-1", JSON.stringify({ "active-1": key })), {
      activeKeyId: "active-1",
      keys: { "active-1": key },
    });
    assert.isNull(parseWebhookKeyRing(undefined, undefined));
  });

  it("fails incomplete, missing-active, malformed, and short-key configuration closed", () => {
    assert.throws(() => parseWebhookKeyRing("active-1", undefined));
    assert.throws(() => parseWebhookKeyRing("active-1", "not-json"));
    assert.throws(() => parseWebhookKeyRing("active-1", JSON.stringify({ other: key })));
    assert.throws(() => parseWebhookKeyRing("active-1", JSON.stringify({ "active-1": "short" })));
  });
});
