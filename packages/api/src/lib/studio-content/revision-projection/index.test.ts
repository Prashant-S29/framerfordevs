import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EntryRevisionComparison, EntryRevisionSummary } from "../../../contracts/entry";
import {
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
  EntryPublicationValidationIssue,
} from "../../../contracts/publication";
import { StudioFormProjection } from "../../../contracts/studio-content";
import {
  projectStudioPublicationFailureDetails,
  projectStudioPublicationPlan,
  projectStudioPublicationStatus,
  projectStudioPublicationSummary,
  projectStudioRevisionComparison,
  projectStudioRevisionSummary,
  studioFormFieldIds,
} from ".";

const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  entry: "019fae8b-1234-7000-8000-000000000005",
  locale: "019fae8b-1234-7000-8000-000000000006",
  schema: "019fae8b-1234-7000-8000-000000000007",
  title: "019fae8b-1234-7000-8000-000000000010",
  shared: "019fae8b-1234-7000-8000-000000000011",
  seo: "019fae8b-1234-7000-8000-000000000012",
  seoTitle: "019fae8b-1234-7000-8000-000000000013",
  hidden: "019fae8b-1234-7000-8000-000000000014",
  legacy: "019fae8b-1234-7000-8000-000000000015",
  fromRevision: "019fae8b-1234-7000-8000-000000000020",
  toRevision: "019fae8b-1234-7000-8000-000000000021",
  publication: "019fae8b-1234-7000-8000-000000000030",
  group: "019fae8b-1234-7000-8000-000000000040",
  tab: "019fae8b-1234-7000-8000-000000000041",
  placement: "019fae8b-1234-7000-8000-000000000042",
} as const;
const hash = "a".repeat(64);
const otherHash = "b".repeat(64);

function formField(
  id: string,
  kind: "short_text" | "object",
  localization: "shared" | "localized" | null,
  children: ReadonlyArray<unknown> = [],
  parentFieldId: string | null = null,
) {
  return {
    id,
    parentFieldId,
    nodeRole: parentFieldId === null ? "root" : "object_property",
    displayLabel: "Field",
    kind,
    required: false,
    localization,
    position: 0,
    helpText: null,
    placeholder: null,
    configuration: {},
    children,
  };
}

const form = Schema.decodeUnknownSync(StudioFormProjection, { onExcessProperty: "error" })({
  collectionId: ids.collection,
  schemaRevisionId: ids.schema,
  contractHash: hash,
  canEdit: true,
  fields: [
    formField(ids.title, "short_text", "localized"),
    formField(ids.shared, "short_text", "shared"),
    formField(ids.seo, "object", "shared", [
      formField(ids.seoTitle, "short_text", null, [], ids.seo),
    ]),
  ],
  editableFieldIds: [ids.title, ids.shared, ids.seo, ids.seoTitle],
  tabs: [],
  sidebarGroups: [],
  currencyMinorUnits: {},
});

function revisionSummary(id: string, contractHash: string, changedFieldIds: Array<string>) {
  return Schema.decodeUnknownSync(EntryRevisionSummary, { onExcessProperty: "error" })({
    id,
    entryId: ids.entry,
    localeId: null,
    scope: "shared",
    sequence: 1,
    previousRevisionId: null,
    schemaRevisionId: ids.schema,
    contractHash,
    changedFieldIds,
    restoredFromRevisionId: null,
    authoredByUserId: "user-1",
    authoredByCredentialId: null,
    authoredAt: "2026-11-01T00:00:00.000Z",
  });
}

const publicationSummary = Schema.decodeUnknownSync(EntryPublicationSummary, {
  onExcessProperty: "error",
})({
  id: ids.publication,
  snapshotId: ids.publication,
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  sequence: 1,
  schemaRevisionId: ids.schema,
  contractHash: hash,
  sharedRevisionId: null,
  sharedVersion: 0,
  localizedRevisionId: null,
  localizedVersion: 0,
  contentHash: hash,
  authorityHash: hash,
  documentHash: hash,
  changedFieldIds: [ids.title, ids.hidden],
  size: {
    documentBytes: 1,
    referenceManifestBytes: 1,
    combinedBytes: 2,
    maximumBytes: 1_048_576,
    bucket: "small",
  },
  publishedByUserId: "user-1",
  publishedByCredentialId: null,
  publishedAt: "2026-11-01T00:00:00.000Z",
  current: true,
});

function status(state: "published" | "unpublished", stateVersion: number) {
  return Schema.decodeUnknownSync(EntryPublicationStatus, { onExcessProperty: "error" })({
    entryId: ids.entry,
    localeId: ids.locale,
    locale: "en",
    state,
    stateVersion,
    currentPublication: state === "published" ? publicationSummary : null,
    currentSchemaRevisionId: ids.schema,
    currentContractHash: hash,
    currentSharedRevisionId: null,
    currentSharedVersion: 0,
    currentLocalizedRevisionId: null,
    currentLocalizedVersion: 0,
    sharedChanged: false,
    localizedChanged: state === "published",
    schemaChanged: false,
    changedSincePublication: state === "published",
  });
}

function issue(fieldId: string | null, code: string) {
  return Schema.decodeUnknownSync(EntryPublicationValidationIssue, { onExcessProperty: "error" })({
    fieldId,
    path: "data",
    code,
    message: "The publication issue message.",
  });
}

function plan(valid: boolean, issues: ReadonlyArray<EntryPublicationValidationIssue>) {
  return Schema.decodeUnknownSync(EntryPublicationPlan, { onExcessProperty: "error" })({
    entryId: ids.entry,
    localeId: ids.locale,
    locale: "en",
    stateVersion: 0,
    currentPublicationId: null,
    schemaRevisionId: ids.schema,
    contractHash: hash,
    sharedRevisionId: null,
    sharedVersion: 0,
    localizedRevisionId: null,
    localizedVersion: 0,
    valid,
    issues: issues.map((item) => ({ ...item })),
    capped: false,
    contentHash: valid ? hash : null,
    authorityHash: valid ? hash : null,
    changedFieldIds: [],
    size: null,
    referencesWouldRefresh: false,
    wouldCreatePublication: valid,
  });
}

describe("Studio revision projection", () => {
  it("collects every projected form field ID", () => {
    assert.deepStrictEqual(
      [...studioFormFieldIds(form)].sort(),
      [ids.title, ids.shared, ids.seo, ids.seoTitle].sort(),
    );
  });

  it("filters changed fields and marks compatibility against the current contract", () => {
    const compatible = projectStudioRevisionSummary(
      revisionSummary(ids.fromRevision, hash, [ids.title, ids.hidden]),
      form,
    );
    const incompatible = projectStudioRevisionSummary(
      revisionSummary(ids.toRevision, otherHash, []),
      form,
    );
    assert.deepStrictEqual([...compatible.changedFieldIds], [ids.title]);
    assert.strictEqual(compatible.compatible, true);
    assert.strictEqual(incompatible.compatible, false);
  });

  it("drops comparison items outside the form and keeps removed schema fields", () => {
    const comparison = Schema.decodeUnknownSync(EntryRevisionComparison, {
      onExcessProperty: "error",
    })({
      entry: {
        id: ids.entry,
        workspaceId: ids.workspace,
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
        displayName: "Entry",
        nameVersion: 1,
        createdByUserId: null,
        createdByCredentialId: null,
        changedByUserId: null,
        changedByCredentialId: null,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
      localeId: ids.locale,
      locale: "en",
      scope: "shared",
      from: revisionSummary(ids.fromRevision, hash, []),
      to: revisionSummary(ids.toRevision, otherHash, []),
      items: [
        {
          fieldId: ids.shared,
          change: "changed",
          before: "a",
          after: "b",
          inCurrentSchema: true,
        },
        {
          fieldId: ids.hidden,
          change: "added",
          after: "secret",
          inCurrentSchema: true,
        },
        {
          fieldId: ids.seo,
          change: "changed",
          before: { [ids.seoTitle]: "same", [ids.hidden]: "x" },
          after: { [ids.seoTitle]: "same", [ids.hidden]: "y" },
          inCurrentSchema: true,
        },
        { fieldId: ids.legacy, change: "removed", before: "old", inCurrentSchema: false },
      ],
      restrictedChanges: false,
      schemaDiffers: true,
      currentSchemaRevisionId: ids.schema,
      currentContractHash: hash,
    });
    const projected = projectStudioRevisionComparison(comparison, form);
    assert.deepStrictEqual(
      projected.items.map((item) => ({ ...item, fieldId: String(item.fieldId) })),
      [
        { fieldId: ids.shared, change: "changed", before: "a", after: "b", inCurrentSchema: true },
        { fieldId: ids.legacy, change: "removed", before: "old", inCurrentSchema: false },
      ],
    );
    assert.strictEqual(projected.restrictedChanges, true);
    assert.strictEqual(projected.schemaDiffers, true);
    assert.strictEqual(projected.to.compatible, false);
    assert.notInclude(JSON.stringify(projected), ids.hidden);
  });

  it("maps publication state, including never published", () => {
    assert.strictEqual(
      projectStudioPublicationStatus(status("unpublished", 0), form).state,
      "never_published",
    );
    assert.strictEqual(
      projectStudioPublicationStatus(status("unpublished", 2), form).state,
      "unpublished",
    );
    const published = projectStudioPublicationStatus(status("published", 1), form);
    assert.strictEqual(published.state, "published");
    assert.deepStrictEqual([...(published.currentPublication?.changedFieldIds ?? [])], [ids.title]);
    assert.deepStrictEqual(
      [...projectStudioPublicationSummary(publicationSummary, form).changedFieldIds],
      [ids.title],
    );
  });

  it("projects a valid publication plan", () => {
    const projected = projectStudioPublicationPlan(plan(true, []), form);
    assert.strictEqual(projected.validation.status, "valid");
    assert.strictEqual(projected.authorityHash, hash);
    assert.deepStrictEqual(projected.entryIssues, []);
  });

  it("projects visible field issues with generic messages and entry issues separately", () => {
    const projected = projectStudioPublicationPlan(
      plan(false, [
        issue(ids.title, "string_required"),
        issue(ids.seoTitle, "string_required"),
        issue(null, "publication_snapshot_too_large"),
      ]),
      form,
    );
    assert.strictEqual(projected.validation.status, "invalid");
    assert.deepStrictEqual(
      projected.validation.issues.map((item) => [item.fieldId, item.scope, item.locale, item.path]),
      [
        [ids.title, "localized", "en", `field/${ids.title}`],
        [ids.seoTitle, "shared", null, `field/${ids.seoTitle}`],
      ],
    );
    assert.deepStrictEqual(
      projected.validation.issues.map((item) => item.message),
      ["This field value is invalid.", "This field value is invalid."],
    );
    assert.deepStrictEqual(
      projected.entryIssues.map((item) => item.code),
      ["publication_snapshot_too_large"],
    );
  });

  it("reports restricted issues without naming hidden fields", () => {
    const projected = projectStudioPublicationPlan(
      plan(false, [
        issue(ids.hidden, "string_required"),
        issue(null, "hidden_field_blocks_publication"),
      ]),
      form,
    );
    assert.strictEqual(projected.validation.status, "restricted_issues");
    assert.deepStrictEqual(projected.validation.issues, []);
    assert.deepStrictEqual(projected.entryIssues, []);
    assert.notInclude(JSON.stringify(projected), ids.hidden);
  });

  it("builds bounded failure details with the hidden-field signal first", () => {
    const locale = { localeId: plan(true, []).localeId, locale: plan(true, []).locale };
    const restricted = projectStudioPublicationFailureDetails(
      [
        ...Array.from({ length: 30 }, () => issue(ids.title, "string_required")),
        issue(ids.hidden, "string_required"),
      ],
      form,
      locale,
    );
    assert.strictEqual(restricted.length, 20);
    assert.strictEqual(restricted[0]?.code, "hidden_field_blocks_publication");
    assert.notInclude(JSON.stringify(restricted), ids.hidden);
    const empty = projectStudioPublicationFailureDetails([], form, locale);
    assert.deepStrictEqual(
      empty.map((detail) => detail.code),
      ["hidden_field_blocks_publication"],
    );
    const visible = projectStudioPublicationFailureDetails(
      [issue(null, "entry_references_exceeded")],
      form,
      locale,
    );
    assert.deepStrictEqual(
      visible.map((detail) => [detail.path, detail.code]),
      [["entry", "entry_references_exceeded"]],
    );
  });
});
