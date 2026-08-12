// Records bounded Preview outcome metrics without content or tenant identity labels.

import { Cause, Clock, Effect, Exit, Option } from "effect";

import type { PreviewItem } from "../contracts/preview";
import { Telemetry, type PreviewReadMetric } from "../observability/telemetry";

function issueCountBucket(count: number): PreviewReadMetric["issueCountBucket"] {
  if (count === 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 25) return "11-25";
  return "26-50";
}

function isPreviewAuditFailure(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    Reflect.get(cause, "_tag") === "DatabaseFailure" &&
    Reflect.get(cause, "operation") === "preview.audit"
  );
}

function sizeBucket(bytes: number): PreviewReadMetric["sizeBucket"] {
  if (bytes <= 262_144) return "small";
  if (bytes <= 1_048_576) return "medium";
  if (bytes <= 2_097_152) return "large";
  return "near_limit";
}

/** Observes one repository read while making telemetry failure non-authoritative. */
export function observePreviewRead<E, R>(
  effect: Effect.Effect<PreviewItem, E, R>,
  source: "current" | "revision",
  subject: "credential" | "user",
): Effect.Effect<PreviewItem, E, R | Telemetry> {
  return Effect.gen(function* () {
    const telemetry = yield* Telemetry;
    const startedAt = yield* Clock.currentTimeMillis;
    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((completedAt) => {
            const success = Exit.isSuccess(exit);
            const issues = success ? exit.value.validation.issues.length : 0;
            const bytes = success
              ? Buffer.byteLength(
                  JSON.stringify({
                    ok: true,
                    data: exit.value,
                    error: null,
                    message: "Preview entry loaded.",
                  }),
                  "utf8",
                )
              : 0;
            const readMetric = telemetry.recordPreviewRead({
              source,
              subject,
              outcome: success ? "success" : "failure",
              validation: success
                ? exit.value.validation.valid
                  ? "valid"
                  : "invalid"
                : "unavailable",
              issueCountBucket: issueCountBucket(issues),
              sizeBucket: success ? sizeBucket(bytes) : "none",
              durationMs: Math.max(0, completedAt - startedAt),
            });
            const auditFailure = Exit.isFailure(exit)
              ? Option.getOrUndefined(Cause.failureOption(exit.cause))
              : undefined;
            return Effect.all([
              readMetric,
              ...(isPreviewAuditFailure(auditFailure)
                ? [telemetry.recordPreviewAuditFailure()]
                : []),
            ]).pipe(
              Effect.asVoid,
              Effect.catchAllCause(() => Effect.void),
            );
          }),
        ),
      ),
    );
  });
}
