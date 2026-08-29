// Verifies bounded Preview metric buckets and non-authoritative telemetry behavior.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import { DatabaseFailure } from "../contracts/errors";
import { PreviewItem, PreviewValidationIssue } from "../contracts/preview";
import {
  Telemetry,
  type PreviewReadMetric,
  type TelemetryService,
} from "../observability/telemetry";
import { observePreviewRead } from "./preview-observation";

const ids = {
  entry: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  schema: "019fae8b-1234-7000-8000-000000000003",
};
const issue = PreviewValidationIssue.make({
  fieldId: null,
  path: "data",
  code: "invalid",
  message: "The selected draft is invalid.",
});

function item(options: { readonly bytes: number; readonly issues: number }) {
  return Schema.decodeUnknownSync(PreviewItem)({
    id: ids.entry,
    collectionId: ids.collection,
    collection: "articles",
    locale: "gu",
    preview: {
      version: 1,
      source: "current",
      schemaRevisionId: ids.schema,
      contractHash: "a".repeat(64),
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: null,
      localizedVersion: 0,
    },
    data: { value: "x".repeat(options.bytes) },
    validation: {
      valid: options.issues === 0,
      issues: Array.from({ length: options.issues }, () => issue),
      capped: options.issues === 50,
    },
  });
}

function telemetry(
  events: Array<PreviewReadMetric>,
  fail = false,
  auditFailures: Array<true> = [],
): TelemetryService {
  return {
    recordHttpRequest: () => Effect.void,
    recordDefect: () => Effect.void,
    recordCredentialVerification: () => Effect.void,
    recordLocaleMutation: () => Effect.void,
    recordSchemaMutation: () => Effect.void,
    recordSchemaValidation: () => Effect.void,
    recordSchemaPublication: () => Effect.void,
    recordEntryPublication: () => Effect.void,
    recordEntryPublicationValidationFailure: () => Effect.void,
    recordPreviewRead: (event) =>
      fail
        ? Effect.die(new Error("telemetry unavailable"))
        : Effect.sync(() => {
            events.push(event);
          }),
    recordPreviewQueryRejection: () => Effect.void,
    recordPreviewAuditFailure: () =>
      Effect.sync(() => {
        auditFailures.push(true);
      }),
    recordToolingRequest: () => Effect.void,
    recordToolingOAuthVerification: () => Effect.void,
    recordAuthoringAuthentication: () => Effect.void,
    recordAuthoringRequest: () => Effect.void,
    recordRateLimitDecision: () => Effect.void,
    recordRateLimitStore: () => Effect.void,
  };
}

describe("Preview observation", () => {
  it("records fixed validation, issue-count, and response-size buckets", async () => {
    const events: Array<PreviewReadMetric> = [];
    const layer = Layer.succeed(Telemetry, telemetry(events));
    const scenarios = [
      item({ bytes: 1, issues: 0 }),
      item({ bytes: 300_000, issues: 1 }),
      item({ bytes: 1_100_000, issues: 11 }),
      item({ bytes: 2_200_000, issues: 26 }),
    ];
    for (const candidate of scenarios) {
      await Effect.runPromise(
        observePreviewRead(Effect.succeed(candidate), "current", "user").pipe(
          Effect.provide(layer),
        ),
      );
    }
    await Effect.runPromiseExit(
      observePreviewRead(Effect.fail("unavailable"), "revision", "credential").pipe(
        Effect.provide(layer),
      ),
    );

    assert.deepStrictEqual(
      events.map((event) => [
        event.source,
        event.subject,
        event.outcome,
        event.validation,
        event.issueCountBucket,
        event.sizeBucket,
      ]),
      [
        ["current", "user", "success", "valid", "0", "small"],
        ["current", "user", "success", "invalid", "1-10", "medium"],
        ["current", "user", "success", "invalid", "11-25", "large"],
        ["current", "user", "success", "invalid", "26-50", "near_limit"],
        ["revision", "credential", "failure", "unavailable", "0", "none"],
      ],
    );
  });

  it("counts only typed Preview audit persistence failures", async () => {
    const auditFailures: Array<true> = [];
    const layer = Layer.succeed(Telemetry, telemetry([], false, auditFailures));
    await Effect.runPromiseExit(
      observePreviewRead(
        Effect.fail(
          DatabaseFailure.make({ operation: "preview.audit", cause: new Error("unavailable") }),
        ),
        "revision",
        "credential",
      ).pipe(Effect.provide(layer)),
    );
    await Effect.runPromiseExit(
      observePreviewRead(
        Effect.fail(
          DatabaseFailure.make({ operation: "preview.read", cause: new Error("unavailable") }),
        ),
        "current",
        "user",
      ).pipe(Effect.provide(layer)),
    );
    assert.lengthOf(auditFailures, 1);
  });

  it("never lets telemetry defects replace successful Preview content", async () => {
    const expected = item({ bytes: 1, issues: 0 });
    const result = await Effect.runPromise(
      observePreviewRead(Effect.succeed(expected), "current", "credential").pipe(
        Effect.provide(Layer.succeed(Telemetry, telemetry([], true))),
      ),
    );

    assert.strictEqual(result, expected);
  });
});
