import { Clock, Effect, Exit, Schema } from "effect";

import { UnauthorizedFailure } from "../../contracts/response/errors";
import type {
  CreateProjectLocaleInput,
  ListProjectLocalesInput,
  ReorderProjectLocalesInput,
  UpdateProjectLocaleDisplayNameInput,
  UpdateProjectLocaleStatusInput,
} from "../../contracts/locale";
import { AuthUserId } from "../../contracts/platform";
import { Telemetry } from "../../observability/telemetry";
import { LocaleRepository } from "../../services/locale/repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

export const listProjectLocales = Effect.fn("locale.list")(function* (
  actorUserId: string,
  input: ListProjectLocalesInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    localeView: input.view,
    includeRemoved: input.includeRemoved,
  });
  const repository = yield* LocaleRepository;
  return yield* repository.listLocales(actorId, input);
});

export const createProjectLocale = Effect.fn("locale.create")(function* (
  actorUserId: string,
  input: CreateProjectLocaleInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* LocaleRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.createLocale(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordLocaleMutation({
        action: "create",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const updateProjectLocaleDisplayName = Effect.fn("locale.display_name.update")(function* (
  actorUserId: string,
  input: UpdateProjectLocaleDisplayNameInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ localeId: input.localeId });
  const repository = yield* LocaleRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.updateDisplayName(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordLocaleMutation({
        action: "update_display_name",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const reorderProjectLocales = Effect.fn("locale.reorder")(function* (
  actorUserId: string,
  input: ReorderProjectLocalesInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    localeCount: input.locales.length,
  });
  const repository = yield* LocaleRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.reorderLocales(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordLocaleMutation({
        action: "reorder",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});

export const updateProjectLocaleStatus = Effect.fn("locale.status.update")(function* (
  actorUserId: string,
  input: UpdateProjectLocaleStatusInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    localeId: input.localeId,
    requestedStatus: input.status,
  });
  const repository = yield* LocaleRepository;
  const telemetry = yield* Telemetry;
  return yield* repository.updateStatus(actorId, input, yield* currentDate, requestId).pipe(
    Effect.onExit((exit) =>
      telemetry.recordLocaleMutation({
        action: "update_status",
        outcome: Exit.isSuccess(exit) ? "success" : "failure",
      }),
    ),
  );
});
