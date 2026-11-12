import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import {
  AuthoringPublicationStatus,
  AuthoringPublishEntryRequest,
  AuthoringUnpublishEntryRequest,
  AuthoringValidatePublicationRequest,
} from "./index";

import * as SchemaStrict from "../../../lib/schema-strict";
const id = "019fae8b-1234-7000-8000-000000000001";

describe("authoring publication contracts", () => {
  it.effect("keeps publication commands exact and closed", () =>
    Effect.gen(function* () {
      const publish = yield* SchemaStrict.decodeUnknownEffect(AuthoringPublishEntryRequest)({
        commandId: id,
        authorityHash: "a".repeat(64),
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: id,
        expectedContractHash: "b".repeat(64),
        expectedSharedVersion: 0,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 0,
        expectedLocalizedRevisionId: null,
      });
      const emptyValidation = yield* SchemaStrict.decodeUnknownEffect(
        AuthoringValidatePublicationRequest,
      )({});
      const excessValidation = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(AuthoringValidatePublicationRequest)({ force: true }),
      );
      const excess = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(AuthoringUnpublishEntryRequest)({
          commandId: id,
          expectedStateVersion: 0,
          expectedPublicationId: null,
          force: true,
        }),
      );
      assert.deepStrictEqual(emptyValidation, {});
      assert.isTrue(Exit.isFailure(excessValidation));
      assert.strictEqual(publish.expectedStateVersion, 0);
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("excludes actor and tenant metadata from publication status", () =>
    Effect.gen(function* () {
      const status = yield* SchemaStrict.decodeUnknownEffect(AuthoringPublicationStatus)({
        entryId: id,
        locale: "en-US",
        state: "unpublished",
        stateVersion: 0,
        currentPublication: null,
        currentSchemaRevisionId: id,
        currentContractHash: "a".repeat(64),
        currentSharedRevisionId: null,
        currentSharedVersion: 0,
        currentLocalizedRevisionId: null,
        currentLocalizedVersion: 0,
        sharedChanged: false,
        localizedChanged: false,
        schemaChanged: false,
        changedSincePublication: false,
      });
      const text = JSON.stringify(status);
      assert.notInclude(text, "workspaceId");
      assert.notInclude(text, "publishedBy");
      assert.notInclude(text, "credentialId");
    }),
  );
});
