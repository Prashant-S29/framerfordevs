import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  ControlPlaneCredentialListQuery,
  ControlPlaneIssueCredentialRequest,
  ControlPlaneProjectAuditQuery,
  ControlPlaneWebhookDeliveryPage,
} from "./index";

const cursor = null;

describe("Control Plane operational contracts", () => {
  it.effect("keeps credential filters and one-time issue intent closed", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknown(ControlPlaneCredentialListQuery)({
        family: "management",
        status: "active",
        cursor,
        limit: 50,
      });
      const issue = yield* Schema.decodeUnknown(ControlPlaneIssueCredentialRequest)({
        family: "management",
        name: "CI",
        scopes: ["project.read"],
        expiresAt: null,
        nonExpiringAcknowledged: true,
        previewAuthorityAcknowledged: false,
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneIssueCredentialRequest)({
          ...issue,
          rawKey: "forbidden",
        }),
      );

      assert.strictEqual(query.limit, 50);
      assert.isNull(issue.expiresAt);
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("requires exact actor filters and bounded ordered audit windows", () =>
    Effect.gen(function* () {
      const base = {
        environmentId: null,
        category: "security",
        actorKind: "credential",
        actorId: "019fae8b-1234-7000-8000-000000000001",
        action: "project.credential.revoked",
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
        cursor,
        limit: 20,
      } as const;
      const valid = yield* Effect.exit(Schema.decodeUnknown(ControlPlaneProjectAuditQuery)(base));
      const missingActor = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({ ...base, actorId: null }),
      );
      const excessiveWindow = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
          ...base,
          to: "2026-11-01T00:00:00.000Z",
        }),
      );
      const reversed = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneProjectAuditQuery)({
          ...base,
          from: "2026-10-02T00:00:00.000Z",
        }),
      );

      assert.isTrue(Exit.isSuccess(valid));
      assert.isTrue(Exit.isFailure(missingActor));
      assert.isTrue(Exit.isFailure(excessiveWindow));
      assert.isTrue(Exit.isFailure(reversed));
    }),
  );

  it.effect("bounds delivery summaries without accepting embedded event bodies", () =>
    Effect.gen(function* () {
      const oversized = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneWebhookDeliveryPage)({
          items: Array.from({ length: 51 }, (_, index) => ({ id: index })),
          nextCursor: null,
        }),
      );
      const maximumPage = yield* Schema.decodeUnknown(ControlPlaneWebhookDeliveryPage)({
        items: Array.from({ length: 50 }, () => ({
          id: "019fae8b-1234-7000-8000-000000000001",
          eventId: "019fae8b-1234-7000-8000-000000000002",
          endpointId: "019fae8b-1234-7000-8000-000000000003",
          eventType: "cms.entry.published",
          eventTime: "2026-09-16T00:00:00.000Z",
          subject: "cms.entry/019fae8b-1234-7000-8000-000000000004",
          kind: "initial",
          status: "canceled",
          attemptCount: 0,
          nextAttemptAt: null,
          completedAt: "2026-09-16T00:00:00.000Z",
          lastOutcome: "project_archived",
          createdAt: "2026-09-16T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
        })),
        nextCursor: null,
      });
      const serialized = JSON.stringify(maximumPage);

      assert.isTrue(Exit.isFailure(oversized));
      assert.isBelow(Buffer.byteLength(serialized, "utf8"), 512 * 1_024);
      assert.notInclude(serialized, "canonicalBody");
    }),
  );
});
