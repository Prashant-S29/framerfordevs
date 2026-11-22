import { describe, expect, it } from "vitest";

import type {
  StudioPublicationPlanDto,
  StudioPublicationStatusDto,
} from "../../../contracts/content";
import {
  studioPlanIsPublishable,
  studioPublicationBadge,
  studioPublishBody,
  studioPublishMessage,
  studioUnpublishBody,
  studioUnpublishMessage,
} from ".";

const publicationId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const commandId = "33333333-3333-4333-8333-333333333333";
const summary = {
  id: publicationId,
  sequence: 4,
  schemaRevisionId: revisionId,
  contractHash: "a".repeat(64),
  changedFieldIds: [],
  publishedAt: "2026-09-29T00:00:00.000Z",
  current: true,
};
const published: StudioPublicationStatusDto = {
  state: "published",
  stateVersion: 3,
  currentPublication: summary,
  sharedChanged: false,
  localizedChanged: false,
  schemaChanged: false,
  changedSincePublication: false,
};
const plan: StudioPublicationPlanDto = {
  authorityHash: "b".repeat(64),
  stateVersion: 3,
  currentPublicationId: publicationId,
  schemaRevisionId: revisionId,
  contractHash: "a".repeat(64),
  sharedVersion: 1,
  sharedRevisionId: null,
  localizedVersion: 2,
  localizedRevisionId: revisionId,
  wouldCreatePublication: true,
  validation: { status: "valid", issues: [], capped: false },
  entryIssues: [],
};

describe("Studio publication presentation", () => {
  it("labels every publication state with text", () => {
    expect(studioPublicationBadge(published).label).toBe("Published");
    expect(studioPublicationBadge({ ...published, changedSincePublication: true }).label).toBe(
      "Changed since publish",
    );
    expect(
      studioPublicationBadge({ ...published, state: "unpublished", currentPublication: null })
        .label,
    ).toBe("Unpublished");
    expect(
      studioPublicationBadge({
        ...published,
        state: "never_published",
        stateVersion: 0,
        currentPublication: null,
      }).label,
    ).toBe("Never published");
  });

  it("publishes only a valid plan and copies its exact authority", () => {
    expect(studioPlanIsPublishable(plan)).toBe(true);
    expect(studioPublishBody(plan, commandId)).toEqual({
      commandId,
      authorityHash: "b".repeat(64),
      expectedStateVersion: 3,
      expectedPublicationId: publicationId,
      expectedSchemaRevisionId: revisionId,
      expectedContractHash: "a".repeat(64),
      expectedSharedVersion: 1,
      expectedSharedRevisionId: null,
      expectedLocalizedVersion: 2,
      expectedLocalizedRevisionId: revisionId,
    });
    for (const blocked of [
      { ...plan, authorityHash: null },
      { ...plan, validation: { status: "restricted_issues" as const, issues: [], capped: false } },
      { ...plan, entryIssues: [{ code: "reference_unpublished", message: "Blocked." }] },
    ]) {
      expect(studioPlanIsPublishable(blocked)).toBe(false);
      expect(studioPublishBody(blocked, commandId)).toBeNull();
    }
  });

  it("unpublishes only the current publication", () => {
    expect(studioUnpublishBody(published, commandId)).toEqual({
      commandId,
      expectedStateVersion: 3,
      expectedPublicationId: publicationId,
    });
    expect(
      studioUnpublishBody(
        { ...published, state: "unpublished", currentPublication: null },
        commandId,
      ),
    ).toBeNull();
  });

  it("explains the Delivery read-back", () => {
    const result = {
      commandId,
      resultKind: "changed" as const,
      stateVersion: 4,
      publication: summary,
      delivery: { status: "verified" as const, currentPublicationId: publicationId },
    };
    expect(studioPublishMessage(result, "English")).toContain("Delivery now serves publication 4");
    expect(
      studioPublishMessage(
        { ...result, delivery: { status: "superseded", currentPublicationId: null } },
        "English",
      ),
    ).toContain("newer publication command");
    expect(studioPublishMessage({ ...result, resultKind: "no_op" }, "English")).toContain(
      "Already published",
    );
    const unpublished = {
      commandId,
      resultKind: "changed" as const,
      stateVersion: 5,
      unpublishedPublicationId: publicationId,
      unpublishedAt: "2026-09-29T00:00:00.000Z",
      delivery: { status: "verified" as const, currentPublicationId: null },
    };
    expect(studioUnpublishMessage(unpublished, "English")).toContain("no longer serves");
    expect(
      studioUnpublishMessage(
        { ...unpublished, delivery: { status: "superseded", currentPublicationId: publicationId } },
        "English",
      ),
    ).toContain("newer publication command");
  });
});
