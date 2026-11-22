import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import type { StudioOAuthPrincipal } from "@framerfordevs/auth";

import { CmsEntryDraft, EntryId, EntryValidation } from "../../contracts/entry";
import { EntryPublicationStatus } from "../../contracts/publication";
import { LocaleTag, ProjectLocaleId } from "../../contracts/locale";
import { WorkspaceId } from "../../contracts/platform";
import { RateLimitDecision, rateLimitPolicies } from "../../contracts/rate-limit";
import { ApiErrorDetail } from "../../contracts/response/api";
import {
  CollectionFieldDefinition,
  ContractHash,
  GeneratedFormDefinition,
  SchemaRevisionId,
} from "../../contracts/schema";
import { StudioBootstrap } from "../../contracts/studio";
import {
  StudioCollectionLocaleScope,
  StudioContentContext,
  StudioContentScope,
  StudioFormProjection,
} from "../../contracts/studio-content";
import {
  ConflictFailure,
  EntryCommandConflictFailure,
  EntryDraftConflictFailure,
  EntryPublicationConflictFailure,
  EntryPublicationInvalidFailure,
  EntryRevisionIncompatibleFailure,
  ForbiddenFailure,
  ValidationFailure,
  VersionConflictFailure,
} from "../../contracts/response/errors";
import { EntryPublicationValidationIssue } from "../../contracts/publication";
import { ApplicationLogger } from "../../observability/logger";
import { makeEntryRepository, EntryRepository } from "../../services/entry/repository";
import {
  makePublicationRepository,
  PublicationRepository,
} from "../../services/publication/repository";
import { RateLimitManager, type RateLimitManagerService } from "../../services/rate-limit/manager";
import { makeSchemaRepository, SchemaRepository } from "../../services/schema/repository";
import { makeStudioRepository, StudioRepository } from "../../services/studio/repository";
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "../../services/studio-content/repository";
import {
  adaptStudioPublicationError,
  adaptStudioRestoreError,
  decodeStudioListRevisionsQuery,
  decodeStudioPublishEntryRequest,
  decodeStudioRestoreRevisionRequest,
  decodeStudioRevisionId,
  decodeStudioUnpublishEntryRequest,
  decodeStudioValidatePublicationRequest,
  adaptStudioCreateError,
  adaptStudioRenameError,
  adaptStudioSaveError,
  decodeStudioCreateEntryRequest,
  decodeStudioListEntriesQuery,
  decodeStudioRenameEntryRequest,
  decodeStudioSaveEntryDraftRequest,
  decodeStudioSearchEntriesRequest,
  getStudioContentContext,
  getStudioEntryWorkspace,
  projectStudioValidation,
  studioNestedCollectionOperations,
} from ".";

describe("Studio Content nested collection gate", () => {
  it("covers every approved nested operation family through one closed matrix", () => {
    assert.deepStrictEqual(studioNestedCollectionOperations, [
      "browse",
      "search",
      "resolve",
      "new_workspace",
      "entry_workspace",
      "create",
      "rename",
      "save",
      "revisions",
      "revision",
      "compare",
      "restore",
      "publication",
      "publications",
      "validate",
      "publish",
      "unpublish",
    ]);
    assert.strictEqual(new Set(studioNestedCollectionOperations).size, 17);
  });

  it.effect("rejects excess properties on every mutation request", () =>
    Effect.gen(function* () {
      const id = "019fae8b-1234-7000-8000-000000000001";
      const common = {
        schemaRevisionId: id,
        contractHash: "a".repeat(64),
        commandId: id,
        sharedMutations: [],
        localizedMutations: [],
        unexpected: true,
      };
      const exits = yield* Effect.all([
        Effect.exit(decodeStudioListEntriesQuery({ limit: 25, unexpected: true })),
        Effect.exit(
          decodeStudioSearchEntriesRequest({ query: "entry", limit: 25, unexpected: true }),
        ),
        Effect.exit(
          decodeStudioCreateEntryRequest({
            ...common,
            displayName: "Entry",
          }),
        ),
        Effect.exit(
          decodeStudioRenameEntryRequest({
            displayName: "Entry",
            expectedNameVersion: 1,
            unexpected: true,
          }),
        ),
        Effect.exit(
          decodeStudioSaveEntryDraftRequest({
            ...common,
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
          }),
        ),
      ]);

      assert.deepStrictEqual(
        exits.map((exit) => exit._tag),
        ["Failure", "Failure", "Failure", "Failure", "Failure"],
      );
    }),
  );

  it.effect("retries entry workspace assembly once when publication authority changes", () =>
    Effect.gen(function* () {
      const ids = {
        workspace: "019fae8b-1234-7000-8000-000000000020",
        project: "019fae8b-1234-7000-8000-000000000021",
        environment: "019fae8b-1234-7000-8000-000000000022",
        collection: "019fae8b-1234-7000-8000-000000000023",
        locale: "019fae8b-1234-7000-8000-000000000024",
        entry: "019fae8b-1234-7000-8000-000000000025",
        field: "019fae8b-1234-7000-8000-000000000026",
        oldRevision: "019fae8b-1234-7000-8000-000000000027",
        currentRevision: "019fae8b-1234-7000-8000-000000000028",
        sharedRevision: "019fae8b-1234-7000-8000-000000000029",
        localizedRevision: "019fae8b-1234-7000-8000-000000000030",
      } as const;
      const hash = ContractHash.make("a".repeat(64));
      const scope = Schema.decodeUnknownSync(StudioCollectionLocaleScope, {
        onExcessProperty: "error",
      })({
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
        locale: "en",
      });
      const principal: StudioOAuthPrincipal = {
        kind: "studio_oauth_user",
        userId: "workspace-retry-user",
        clientId: "ffd-studio-v1-019fae8b-1234-7000-8000-000000000031",
        registrationId: "019fae8b-1234-7000-8000-000000000031",
        registrationVersion: 1,
        projectId: ids.project,
        environmentId: ids.environment,
        grantId: "019fae8b-1234-7000-8000-000000000032",
        auditMarkerId: "019fae8b-1234-7000-8000-000000000033",
        grantExpiresAtEpochSeconds: 1_900_000_000,
        scopes: ["studio:session", "offline_access"],
        expiresAtEpochSeconds: 1_900_000_000,
      };
      const field = Schema.decodeUnknownSync(CollectionFieldDefinition, {
        onExcessProperty: "error",
      })({
        id: ids.field,
        parentFieldId: null,
        nodeRole: "root",
        apiKey: "title",
        displayLabel: "Title",
        kind: "short_text",
        required: false,
        localization: "localized",
        deprecated: false,
        position: 0,
        editor: {
          helpText: null,
          placeholder: null,
          visibleToRoles: ["developer"],
          editableByRoles: ["developer"],
        },
        configuration: {},
        children: [],
      });
      const form = (revisionId: string) =>
        Schema.decodeUnknownSync(GeneratedFormDefinition, { onExcessProperty: "error" })({
          source: "published",
          collectionId: ids.collection,
          revisionId,
          formatVersion: 1,
          validationProfile: "field-system@1",
          currencyRegistryProfile: "iso-4217@2026-01-01",
          contractHash: hash,
          role: "developer",
          canEdit: true,
          fields: [field],
          editableFieldIds: [ids.field],
          editorLayout: {
            version: 1,
            tabs: [
              {
                id: "019fae8b-1234-7000-8000-000000000034",
                title: "Content",
                description: null,
                position: 0,
                visibleToRoles: ["developer"],
                groups: [
                  {
                    id: "019fae8b-1234-7000-8000-000000000035",
                    title: "Main",
                    description: null,
                    position: 0,
                    columns: 1,
                    visibleToRoles: ["developer"],
                    fields: [
                      {
                        id: "019fae8b-1234-7000-8000-000000000036",
                        fieldId: ids.field,
                        position: 0,
                        helpTextOverride: null,
                        visibleToRoles: ["developer"],
                      },
                    ],
                  },
                ],
              },
            ],
            sidebarGroups: [],
          },
          currencyMinorUnits: {},
        });
      const draft = (revisionId: string) =>
        Schema.decodeUnknownSync(CmsEntryDraft, { onExcessProperty: "error" })({
          entry: {
            id: ids.entry,
            workspaceId: ids.workspace,
            projectId: ids.project,
            environmentId: ids.environment,
            collectionId: ids.collection,
            displayName: "Entry",
            nameVersion: 1,
            createdByUserId: principal.userId,
            createdByCredentialId: null,
            changedByUserId: principal.userId,
            changedByCredentialId: null,
            createdAt: "2026-09-28T00:00:00.000Z",
            updatedAt: "2026-09-28T00:00:00.000Z",
          },
          localeId: ids.locale,
          locale: "en",
          schemaRevisionId: revisionId,
          contractHash: hash,
          sharedVersion: 1,
          sharedRevisionId: ids.sharedRevision,
          sharedValues: {},
          localizedVersion: 1,
          localizedRevisionId: ids.localizedRevision,
          localizedValues: { [ids.field]: "Visible" },
          canEditShared: true,
          validation: { valid: true, issues: [], capped: false },
        });
      const bootstrap = Schema.decodeUnknownSync(StudioBootstrap, { onExcessProperty: "error" })({
        formatVersion: 1,
        registration: {
          id: principal.registrationId,
          version: principal.registrationVersion,
          applicationOrigin: "https://application.example.test",
          mountPath: "/studio",
        },
        project: { id: ids.project, name: "Project", workspaceId: ids.workspace },
        environment: { id: ids.environment, key: "main", name: "main" },
        user: { id: principal.userId, name: "User", email: "user@example.test" },
        role: "developer",
        effectiveActions: ["project.read", "project.update"],
        session: { expiresAt: "2027-01-15T08:00:00.000Z" },
      });
      const authority = (revisionId: string) => ({
        workspaceId: WorkspaceId.make(ids.workspace),
        role: "developer" as const,
        localeId: ProjectLocaleId.make(ids.locale),
        locale: LocaleTag.make("en"),
        schemaRevisionId: SchemaRevisionId.make(revisionId),
        canCreate: true,
        canRename: true,
        canWriteLocalized: true,
        canWriteShared: true,
        canPublish: true,
      });
      let authorizationCalls = 0;
      let draftCalls = 0;
      const costs: Array<number> = [];
      const contentRepository: ReturnType<typeof makeStudioContentRepository> = {
        authorizeCollection: () => {
          authorizationCalls += 1;
          return Effect.succeed(
            authorizationCalls === 1 ? authority(ids.oldRevision) : authority(ids.currentRevision),
          );
        },
        getContext: () => Effect.die("Unexpected context call."),
        listEntries: () => Effect.die("Unexpected list call."),
        resolveEntryLabels: () => Effect.die("Unexpected resolution call."),
      };
      const schemaRepository: ReturnType<typeof makeSchemaRepository> = {
        ...makeSchemaRepository(),
        getPublishedForm: (_actor, input) =>
          Effect.succeed(form(input.revisionId ?? ids.currentRevision)),
      };
      const entryRepository: ReturnType<typeof makeEntryRepository> = {
        ...makeEntryRepository(),
        getDraft: () => {
          draftCalls += 1;
          return Effect.succeed(draft(draftCalls === 1 ? ids.oldRevision : ids.currentRevision));
        },
      };
      const rateLimitManager: RateLimitManagerService = {
        evaluate: (input) => {
          costs.push(input.cost);
          return Effect.succeed(
            Schema.decodeUnknownSync(RateLimitDecision, { onExcessProperty: "error" })({
              allowed: true,
              policy: input.policy,
              cost: input.cost,
              limit: rateLimitPolicies[input.policy].limitPerInterval,
              remaining: rateLimitPolicies[input.policy].capacity,
              resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
              retryAfterSeconds: null,
              enforcementMode: "memory",
            }),
          );
        },
        reset: () => Effect.void,
        retainedFallbackEntryCount: Effect.succeed(0),
      };
      const workspace = yield* getStudioEntryWorkspace(
        principal,
        scope,
        EntryId.make(ids.entry),
        new Date("2026-09-28T00:00:00.000Z"),
      ).pipe(
        Effect.provideService(StudioRepository, {
          ...makeStudioRepository(),
          authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
          getBootstrap: () => Effect.succeed(bootstrap),
        }),
        Effect.provideService(StudioContentRepository, contentRepository),
        Effect.provideService(SchemaRepository, schemaRepository),
        Effect.provideService(EntryRepository, entryRepository),
        Effect.provideService(PublicationRepository, {
          ...makePublicationRepository(),
          getStatus: () =>
            Effect.succeed(
              Schema.decodeUnknownSync(EntryPublicationStatus, { onExcessProperty: "error" })({
                entryId: ids.entry,
                localeId: ids.locale,
                locale: "en",
                state: "unpublished",
                stateVersion: 0,
                currentPublication: null,
                currentSchemaRevisionId: ids.currentRevision,
                currentContractHash: hash,
                currentSharedRevisionId: ids.sharedRevision,
                currentSharedVersion: 1,
                currentLocalizedRevisionId: ids.localizedRevision,
                currentLocalizedVersion: 1,
                sharedChanged: false,
                localizedChanged: false,
                schemaChanged: false,
                changedSincePublication: false,
              }),
            ),
        }),
        Effect.provideService(RateLimitManager, rateLimitManager),
        Effect.provideService(ApplicationLogger, {
          info: () => Effect.void,
          error: () => Effect.void,
        }),
      );

      assert.strictEqual(String(workspace.form.schemaRevisionId), ids.currentRevision);
      assert.strictEqual(String(workspace.draft.schemaRevisionId), ids.currentRevision);
      assert.strictEqual(workspace.publication.state, "never_published");
      assert.strictEqual(workspace.capabilities.canPublish, true);
      assert.strictEqual(authorizationCalls, 3);
      assert.strictEqual(draftCalls, 2);
      assert.deepStrictEqual(costs, [3]);
    }),
  );

  it.effect("logs projection-invalid context notices with only closed safe fields", () =>
    Effect.gen(function* () {
      const ids = {
        workspace: "019fae8b-1234-7000-8000-000000000040",
        project: "019fae8b-1234-7000-8000-000000000041",
        environment: "019fae8b-1234-7000-8000-000000000042",
        collection: "019fae8b-1234-7000-8000-000000000043",
        registration: "019fae8b-1234-7000-8000-000000000044",
        grant: "019fae8b-1234-7000-8000-000000000045",
        marker: "019fae8b-1234-7000-8000-000000000046",
      } as const;
      const principal: StudioOAuthPrincipal = {
        kind: "studio_oauth_user",
        userId: "projection-log-user",
        clientId: `ffd-studio-v1-${ids.registration}`,
        registrationId: ids.registration,
        registrationVersion: 1,
        projectId: ids.project,
        environmentId: ids.environment,
        grantId: ids.grant,
        auditMarkerId: ids.marker,
        grantExpiresAtEpochSeconds: 1_900_000_000,
        scopes: ["studio:session", "offline_access"],
        expiresAtEpochSeconds: 1_900_000_000,
      };
      const scope = Schema.decodeUnknownSync(StudioContentScope, { onExcessProperty: "error" })({
        projectId: ids.project,
        environmentId: ids.environment,
      });
      const context = Schema.decodeUnknownSync(StudioContentContext, { onExcessProperty: "error" })(
        {
          locales: [],
          collections: [],
          configurationNotices: [
            {
              collectionId: ids.collection,
              displayName: "Must not be logged",
              reason: "projection_invalid",
            },
          ],
        },
      );
      const bootstrap = Schema.decodeUnknownSync(StudioBootstrap, { onExcessProperty: "error" })({
        formatVersion: 1,
        registration: {
          id: ids.registration,
          version: 1,
          applicationOrigin: "https://application.example.test",
          mountPath: "/studio",
        },
        project: { id: ids.project, name: "Project", workspaceId: ids.workspace },
        environment: { id: ids.environment, key: "main", name: "main" },
        user: { id: principal.userId, name: "User", email: "private@example.test" },
        role: "developer",
        effectiveActions: ["project.read"],
        session: { expiresAt: "2027-01-15T08:00:00.000Z" },
      });
      const logged: Array<{ readonly message: string; readonly fields: unknown }> = [];
      const rateLimitManager: RateLimitManagerService = {
        evaluate: (input) =>
          Effect.succeed(
            Schema.decodeUnknownSync(RateLimitDecision, { onExcessProperty: "error" })({
              allowed: true,
              policy: input.policy,
              cost: input.cost,
              limit: rateLimitPolicies[input.policy].limitPerInterval,
              remaining: rateLimitPolicies[input.policy].capacity,
              resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
              retryAfterSeconds: null,
              enforcementMode: "memory",
            }),
          ),
        reset: () => Effect.void,
        retainedFallbackEntryCount: Effect.succeed(0),
      };
      const result = yield* getStudioContentContext(principal, scope, new Date()).pipe(
        Effect.provideService(StudioRepository, {
          ...makeStudioRepository(),
          getBootstrap: () => Effect.succeed(bootstrap),
        }),
        Effect.provideService(StudioContentRepository, {
          ...makeStudioContentRepository(),
          getContext: () => Effect.succeed(context),
        }),
        Effect.provideService(RateLimitManager, rateLimitManager),
        Effect.provideService(ApplicationLogger, {
          info: () => Effect.void,
          error: (message, fields) =>
            Effect.sync(() => {
              logged.push({ message, fields });
            }),
        }),
      );

      assert.strictEqual(result, context);
      assert.deepStrictEqual(logged, [
        {
          message: "Studio collection projection invariant failed.",
          fields: {
            projectId: ids.project,
            environmentId: ids.environment,
            collectionId: ids.collection,
            reason: "projection_invalid",
          },
        },
      ]);
      assert.notInclude(JSON.stringify(logged), "Must not be logged");
      assert.notInclude(JSON.stringify(logged), "private@example.test");
    }),
  );

  it("projects only visible validation issues and closes hidden failures", () => {
    const ids = {
      collection: "019fae8b-1234-7000-8000-000000000010",
      revision: "019fae8b-1234-7000-8000-000000000011",
      visible: "019fae8b-1234-7000-8000-000000000012",
      hidden: "019fae8b-1234-7000-8000-000000000013",
      locale: "019fae8b-1234-7000-8000-000000000014",
      tab: "019fae8b-1234-7000-8000-000000000015",
      group: "019fae8b-1234-7000-8000-000000000016",
      placement: "019fae8b-1234-7000-8000-000000000017",
    } as const;
    const form = Schema.decodeUnknownSync(StudioFormProjection, { onExcessProperty: "error" })({
      collectionId: ids.collection,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      canEdit: true,
      fields: [
        {
          id: ids.visible,
          parentFieldId: null,
          nodeRole: "root",
          displayLabel: "Visible",
          kind: "short_text",
          required: false,
          localization: "localized",
          position: 0,
          helpText: null,
          placeholder: null,
          configuration: {},
          children: [],
        },
      ],
      editableFieldIds: [ids.visible],
      tabs: [
        {
          id: ids.tab,
          title: "Content",
          description: null,
          position: 0,
          groups: [
            {
              id: ids.group,
              title: "Main",
              description: null,
              position: 0,
              columns: 1,
              fields: [
                {
                  id: ids.placement,
                  fieldId: ids.visible,
                  position: 0,
                  helpTextOverride: null,
                },
              ],
            },
          ],
        },
      ],
      sidebarGroups: [],
      currencyMinorUnits: {},
    });
    const issue = (fieldId: string, message: string) => ({
      fieldId,
      path: fieldId,
      scope: "localized",
      localeId: ids.locale,
      locale: "en",
      code: "required",
      message,
    });
    const validation = Schema.decodeUnknownSync(EntryValidation, { onExcessProperty: "error" })({
      valid: false,
      issues: [issue(ids.visible, "Visible issue"), issue(ids.hidden, "Hidden issue")],
      capped: false,
    });

    const projected = projectStudioValidation(validation, form);
    assert.strictEqual(projected.status, "restricted_issues");
    assert.strictEqual(projected.issues.length, 1);
    assert.strictEqual(String(projected.issues[0]?.fieldId), ids.visible);
    assert.notInclude(JSON.stringify(projected), "Hidden issue");
    assert.strictEqual(
      projectStudioValidation(
        Schema.decodeUnknownSync(EntryValidation, { onExcessProperty: "error" })({
          valid: false,
          issues: [issue(ids.visible, "Visible issue")],
          capped: false,
        }),
        form,
      ).status,
      "invalid",
    );
    assert.strictEqual(
      projectStudioValidation(
        Schema.decodeUnknownSync(EntryValidation, { onExcessProperty: "error" })({
          valid: true,
          issues: [],
          capped: false,
        }),
        form,
      ).status,
      "valid",
    );
  });

  it("adapts only Studio mutation conflicts and preserves draft details", () => {
    const details = [
      ApiErrorDetail.make({
        code: "localized_version_conflict",
        message: "The localized draft changed.",
        scope: "localized",
        expectedVersion: 2,
        currentVersion: 3,
      }),
    ];
    const create = adaptStudioCreateError(EntryCommandConflictFailure.make());
    const rename = adaptStudioRenameError(VersionConflictFailure.make());
    const saveDraft = adaptStudioSaveError(EntryDraftConflictFailure.make({ details }));
    const saveCommand = adaptStudioSaveError(EntryCommandConflictFailure.make());
    const unchanged = ForbiddenFailure.make();

    assert.strictEqual(create._tag, "StudioCommandConflictFailure");
    assert.strictEqual(rename._tag, "StudioNameVersionConflictFailure");
    assert.strictEqual(saveDraft._tag, "StudioDraftVersionConflictFailure");
    if (saveDraft._tag === "StudioDraftVersionConflictFailure") {
      assert.deepStrictEqual(saveDraft.details, details);
    }
    assert.strictEqual(saveCommand._tag, "StudioCommandConflictFailure");
    assert.strictEqual(adaptStudioSaveError(unchanged), unchanged);
  });

  it("adapts restore failures to closed Studio codes", () => {
    const details = [
      ApiErrorDetail.make({
        path: "expectedVersion",
        code: "entry_draft_stale",
        message: "Changed.",
      }),
    ];
    assert.strictEqual(
      adaptStudioRestoreError(EntryRevisionIncompatibleFailure.make())._tag,
      "StudioRevisionIncompatibleFailure",
    );
    assert.strictEqual(
      adaptStudioRestoreError(ConflictFailure.make())._tag,
      "AuthoringStaleSchemaFailure",
    );
    assert.strictEqual(
      adaptStudioRestoreError(EntryCommandConflictFailure.make())._tag,
      "StudioCommandConflictFailure",
    );
    const draft = adaptStudioRestoreError(EntryDraftConflictFailure.make({ details }));
    assert.strictEqual(draft._tag, "StudioDraftVersionConflictFailure");
    const validation = adaptStudioRestoreError(
      ValidationFailure.make({
        details: [ApiErrorDetail.make({ path: "values.secret", code: "x", message: "Hidden." })],
      }),
    );
    assert.strictEqual(validation._tag, "ValidationFailure");
    assert.notInclude(JSON.stringify(validation), "secret");
    const unchanged = ForbiddenFailure.make();
    assert.strictEqual(adaptStudioRestoreError(unchanged), unchanged);
  });

  it("adapts publication failures and hides fields outside the Studio form", () => {
    const form = Schema.decodeUnknownSync(StudioFormProjection, { onExcessProperty: "error" })({
      collectionId: "019fae8b-1234-7000-8000-000000000050",
      schemaRevisionId: "019fae8b-1234-7000-8000-000000000051",
      contractHash: "a".repeat(64),
      canEdit: true,
      fields: [],
      editableFieldIds: [],
      tabs: [],
      sidebarGroups: [],
      currencyMinorUnits: {},
    });
    const authority = {
      localeId: ProjectLocaleId.make("019fae8b-1234-7000-8000-000000000052"),
      locale: LocaleTag.make("en"),
    };
    const invalid = adaptStudioPublicationError(
      EntryPublicationInvalidFailure.make({
        issues: [
          EntryPublicationValidationIssue.make({
            fieldId: null,
            path: "data",
            code: "hidden_field_blocks_publication",
            message: "Hidden.",
          }),
        ],
      }),
      form,
      authority,
    );
    assert.strictEqual(invalid._tag, "StudioPublicationInvalidFailure");
    if (invalid._tag === "StudioPublicationInvalidFailure") {
      assert.deepStrictEqual(
        invalid.details.map((detail) => detail.code),
        ["hidden_field_blocks_publication"],
      );
    }
    const conflict = adaptStudioPublicationError(
      EntryPublicationConflictFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "expectedStateVersion",
            code: "publication_authority_changed",
            message: "Changed.",
          }),
        ],
      }),
      form,
      authority,
    );
    assert.strictEqual(conflict._tag, "StudioPublicationStateConflictFailure");
    assert.strictEqual(
      adaptStudioPublicationError(EntryCommandConflictFailure.make(), form, authority)._tag,
      "StudioCommandConflictFailure",
    );
  });

  it.effect("decodes revision and publication requests strictly", () =>
    Effect.gen(function* () {
      const id = "019fae8b-1234-7000-8000-000000000060";
      const hash = "a".repeat(64);
      const accepted = yield* Effect.all([
        decodeStudioListRevisionsQuery({ scope: "localized" }),
        decodeStudioRevisionId(id),
        decodeStudioRestoreRevisionRequest({
          scope: "shared",
          schemaRevisionId: id,
          contractHash: hash,
          expectedVersion: 0,
          commandId: id,
        }),
        decodeStudioValidatePublicationRequest({}),
        decodeStudioUnpublishEntryRequest({
          commandId: id,
          expectedStateVersion: 0,
          expectedPublicationId: null,
        }),
      ]);
      assert.strictEqual(accepted.length, 5);
      const exits = yield* Effect.all([
        Effect.exit(decodeStudioListRevisionsQuery({ scope: "shared", unexpected: true })),
        Effect.exit(decodeStudioRevisionId("not-a-revision")),
        Effect.exit(decodeStudioValidatePublicationRequest({ unexpected: true })),
        Effect.exit(decodeStudioPublishEntryRequest({ commandId: id })),
        Effect.exit(
          decodeStudioUnpublishEntryRequest({
            commandId: id,
            expectedStateVersion: 0,
            expectedPublicationId: null,
            unexpected: true,
          }),
        ),
      ]);
      assert.deepStrictEqual(
        exits.map((exit) => exit._tag),
        ["Failure", "Failure", "Failure", "Failure", "Failure"],
      );
    }),
  );
});
