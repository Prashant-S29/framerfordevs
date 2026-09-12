import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import {
  Telemetry,
  TelemetryLive,
  authoringCostBucket,
  authoringSizeBucket,
  toolingPageCountBucket,
  toolingResponseSizeBucket,
} from "./index";

describe("Effect metrics", () => {
  layer(TelemetryLive)((it) => {
    it.effect("records HTTP and bounded CMS schema metrics without resource labels", () =>
      Effect.gen(function* () {
        const telemetry = yield* Telemetry;

        yield* telemetry.recordHttpRequest({
          method: "GET",
          routeFamily: "health",
          statusFamily: "2xx",
          durationMs: 12,
        });
        yield* telemetry.recordDefect("rpc");
        yield* telemetry.recordCredentialVerification({ family: "delivery", outcome: "success" });
        yield* telemetry.recordLocaleMutation({ action: "create", outcome: "success" });
        yield* telemetry.recordSchemaPublication({
          outcome: "success",
          severity: "breaking",
          fieldCountBucket: "11-50",
          durationMs: 24,
        });
        yield* telemetry.recordEntryPublication({
          operation: "publish",
          outcome: "success",
          sizeBucket: "small",
          durationMs: 32,
        });
        yield* telemetry.recordEntryPublicationValidationFailure("field_invalid");
        yield* telemetry.recordPreviewRead({
          source: "revision",
          subject: "credential",
          outcome: "success",
          validation: "invalid",
          issueCountBucket: "1-10",
          sizeBucket: "small",
          durationMs: 18,
        });
        yield* telemetry.recordPreviewQueryRejection("credential_in_query");
        yield* telemetry.recordPreviewAuditFailure();
        yield* telemetry.recordControlPlaneRequest({
          operation: "project_create",
          subject: "oauth_user",
          outcome: "success",
          statusFamily: "2xx",
          costBucket: "5",
          durationMs: 19,
        });
        yield* telemetry.recordToolingRequest({
          endpoint: "manifest",
          subject: "oauth_user",
          outcome: "success",
          statusFamily: "2xx",
          responseSizeBucket: "small",
          pageCountBucket: "11-20",
          durationMs: 20,
        });
        yield* telemetry.recordToolingOAuthVerification("success");
        yield* telemetry.recordAuthoringAuthentication({
          subject: "management_credential",
          outcome: "success",
        });
        yield* telemetry.recordAuthoringRequest({
          endpoint: "schema_apply",
          subject: "management_credential",
          outcome: "success",
          statusFamily: "2xx",
          requestSizeBucket: "medium",
          responseSizeBucket: "small",
          costBucket: "6-20",
          durationMs: 28,
        });
        yield* telemetry.recordRateLimitDecision({
          policy: "delivery.credential",
          enforcementMode: "redis",
          outcome: "allowed",
        });
        yield* telemetry.recordRateLimitStore({ result: "success", durationMs: 2 });

        assert.deepStrictEqual([0, 1, 10, 11, 20, 21, 50].map(toolingPageCountBucket), [
          "0",
          "1-10",
          "1-10",
          "11-20",
          "11-20",
          "21-50",
          "21-50",
        ]);
        assert.deepStrictEqual(
          [0, 1, 65_536, 65_537, 262_144, 262_145, 1_048_576, 1_048_577].map(
            toolingResponseSizeBucket,
          ),
          ["none", "small", "small", "medium", "medium", "large", "large", "near_limit"],
        );
        assert.deepStrictEqual(
          [0, 1, 16_384, 16_385, 262_144, 262_145, 1_048_576, 1_048_577].map(authoringSizeBucket),
          ["none", "small", "small", "medium", "medium", "large", "large", "near_limit"],
        );
        assert.deepStrictEqual([0, 1, 2, 5, 6, 20, 21, 50, 51, 100].map(authoringCostBucket), [
          "1",
          "1",
          "2-5",
          "2-5",
          "6-20",
          "6-20",
          "21-50",
          "21-50",
          "51-100",
          "51-100",
        ]);
      }),
    );
  });
});
