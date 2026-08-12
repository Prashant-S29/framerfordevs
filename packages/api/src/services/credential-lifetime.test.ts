// Verifies exact Preview credential lifetime boundaries independently from persistence and transport.

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  isCredentialIssueLifetimeCompliant,
  isStoredCredentialLifetimeCompliant,
  previewCredentialMaximumLifetimeMs,
} from "./credential-lifetime";

const issuedAt = new Date("2026-08-12T00:00:00.000Z");

/** Creates an expiry at an exact offset from the fixed issuance instant. */
function expiresAfter(offsetMs: number): Date {
  return new Date(issuedAt.getTime() + offsetMs);
}

describe("Preview credential lifetime policy", () => {
  it.effect(
    "accepts the exact 30-day boundary and rejects null, elapsed, and one millisecond over",
    () =>
      Effect.sync(() => {
        assert.isTrue(
          isCredentialIssueLifetimeCompliant(
            "preview",
            expiresAfter(previewCredentialMaximumLifetimeMs),
            issuedAt,
          ),
        );
        assert.isFalse(isCredentialIssueLifetimeCompliant("preview", null, issuedAt));
        assert.isFalse(isCredentialIssueLifetimeCompliant("preview", issuedAt, issuedAt));
        assert.isFalse(
          isCredentialIssueLifetimeCompliant(
            "preview",
            expiresAfter(previewCredentialMaximumLifetimeMs + 1),
            issuedAt,
          ),
        );
      }),
  );

  it.effect("preserves nullable and long-lived behavior for management and Delivery families", () =>
    Effect.sync(() => {
      assert.isTrue(isCredentialIssueLifetimeCompliant("management", null, issuedAt));
      assert.isTrue(
        isCredentialIssueLifetimeCompliant(
          "delivery",
          expiresAfter(previewCredentialMaximumLifetimeMs * 10),
          issuedAt,
        ),
      );
    }),
  );

  it.effect(
    "fails closed for stored legacy Preview lifetimes without changing other families",
    () =>
      Effect.sync(() => {
        assert.isFalse(
          isStoredCredentialLifetimeCompliant({
            family: "preview",
            expiresAt: null,
            createdAt: issuedAt,
          }),
        );
        assert.isFalse(
          isStoredCredentialLifetimeCompliant({
            family: "preview",
            expiresAt: expiresAfter(previewCredentialMaximumLifetimeMs + 1),
            createdAt: issuedAt,
          }),
        );
        assert.isTrue(
          isStoredCredentialLifetimeCompliant({
            family: "management",
            expiresAt: null,
            createdAt: issuedAt,
          }),
        );
      }),
  );
});
