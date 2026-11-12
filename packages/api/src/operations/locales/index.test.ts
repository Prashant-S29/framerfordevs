import { assert, describe, layer } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";

import {
  CreateProjectLocaleInput,
  ListProjectLocalesInput,
  ProjectLocale,
  ProjectLocaleList,
  ReorderProjectLocalesInput,
  UpdateProjectLocaleDisplayNameInput,
  UpdateProjectLocaleStatusInput,
} from "../../contracts/locale";
import { TelemetryLive } from "../../observability/telemetry";
import { LocaleRepository, makeLocaleRepository } from "../../services/locale/repository";
import {
  createProjectLocale,
  listProjectLocales,
  reorderProjectLocales,
  updateProjectLocaleDisplayName,
  updateProjectLocaleStatus,
} from "./index";

import * as SchemaStrict from "../../lib/schema-strict";
const projectId = "019fae8b-1234-7000-8000-000000000001";
const localeId = "019fae8b-1234-7000-8000-000000000002";
const timestamp = "2026-08-01T12:00:00.000Z";
const locale = SchemaStrict.decodeUnknownSync(ProjectLocale)({
  id: localeId,
  workspaceId: "019fae8b-1234-7000-8000-000000000003",
  projectId,
  tag: "en",
  displayName: "English",
  status: "enabled",
  position: 0,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const localeList = ProjectLocaleList.make({ items: [locale] });
const calls: Array<string> = [];

const LocaleRepositoryTest = Layer.succeed(LocaleRepository, {
  ...makeLocaleRepository(),
  listLocales: () => Effect.sync(() => (calls.push("listLocales"), localeList)),
  createLocale: () => Effect.sync(() => (calls.push("createLocale"), locale)),
  updateDisplayName: () => Effect.sync(() => (calls.push("updateDisplayName"), locale)),
  reorderLocales: () => Effect.sync(() => (calls.push("reorderLocales"), localeList)),
  updateStatus: () => Effect.sync(() => (calls.push("updateStatus"), locale)),
});
const LocaleOperationTest = Layer.merge(LocaleRepositoryTest, TelemetryLive);

describe("locale operations", () => {
  layer(LocaleOperationTest)((it) => {
    it.effect("forwards every locale workflow through a replaceable repository", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const actorId = "user-1";
        const requestId = "request-locale-operations";
        yield* listProjectLocales(
          actorId,
          yield* SchemaStrict.decodeUnknownEffect(ListProjectLocalesInput)({
            projectId,
            view: "settings",
            includeRemoved: false,
          }),
        );
        yield* createProjectLocale(
          actorId,
          yield* SchemaStrict.decodeUnknownEffect(CreateProjectLocaleInput)({
            projectId,
            tag: "hi",
            displayName: "Hindi",
          }),
          requestId,
        );
        yield* updateProjectLocaleDisplayName(
          actorId,
          yield* SchemaStrict.decodeUnknownEffect(UpdateProjectLocaleDisplayNameInput)({
            projectId,
            localeId,
            version: 1,
            displayName: "English",
          }),
          requestId,
        );
        yield* reorderProjectLocales(
          actorId,
          yield* SchemaStrict.decodeUnknownEffect(ReorderProjectLocalesInput)({
            projectId,
            locales: [{ localeId, version: 1 }],
          }),
          requestId,
        );
        yield* updateProjectLocaleStatus(
          actorId,
          yield* SchemaStrict.decodeUnknownEffect(UpdateProjectLocaleStatusInput)({
            projectId,
            localeId,
            version: 1,
            status: "enabled",
            confirmDraftImpact: false,
          }),
          requestId,
        );

        assert.deepEqual(calls, [
          "listLocales",
          "createLocale",
          "updateDisplayName",
          "reorderLocales",
          "updateStatus",
        ]);
      }),
    );

    it.effect("rejects malformed actors before repository access", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const exit = yield* Effect.exit(
          listProjectLocales(
            "",
            yield* SchemaStrict.decodeUnknownEffect(ListProjectLocalesInput)({
              projectId,
              view: "enabled",
              includeRemoved: false,
            }),
          ),
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.deepEqual(calls, []);
      }),
    );
  });
});
