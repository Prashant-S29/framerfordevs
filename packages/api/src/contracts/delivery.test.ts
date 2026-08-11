// Verifies Delivery configuration invariants and stable published-response metadata without draft fields.

import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  DeliveryCollectionConfiguration,
  DeliveryFieldCapabilities,
  DeliveryItem,
  DeliveryPage,
  UpdateDeliveryConfigurationInput,
} from "./delivery";

const ids = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  fieldId: "019fae8b-1234-7000-8000-000000000004",
  entryId: "019fae8b-1234-7000-8000-000000000005",
  publicationId: "019fae8b-1234-7000-8000-000000000006",
  revisionId: "019fae8b-1234-7000-8000-000000000007",
  localeId: "019fae8b-1234-7000-8000-000000000008",
  userId: "delivery-contract-user",
};

const capability = {
  fieldId: ids.fieldId,
  fieldKey: "slug",
  kind: "slug",
  filterable: true,
  sortable: true,
  uniqueLookup: true,
};

describe("Delivery contracts", () => {
  it("requires unique lookup to imply filtering and at least one capability", () => {
    expect(Schema.decodeUnknownSync(DeliveryFieldCapabilities)([capability])).toHaveLength(1);
    expect(() =>
      Schema.decodeUnknownSync(DeliveryFieldCapabilities)([{ ...capability, filterable: false }]),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(DeliveryFieldCapabilities)([
        { ...capability, filterable: false, sortable: false, uniqueLookup: false },
      ]),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(DeliveryFieldCapabilities)([capability, capability]),
    ).toThrow();
  });

  it("decodes protected/public management configuration independently from schema history", () => {
    const configuration = Schema.decodeUnknownSync(DeliveryCollectionConfiguration)({
      projectId: ids.projectId,
      environmentId: ids.environmentId,
      collectionId: ids.collectionId,
      collectionKey: "articles",
      access: "protected",
      version: 1,
      fields: [capability],
      updatedByUserId: ids.userId,
      updatedAt: "2026-08-09T12:00:00.000Z",
    });
    const publicUpdate = Schema.decodeUnknownSync(UpdateDeliveryConfigurationInput)({
      projectId: ids.projectId,
      environmentId: ids.environmentId,
      collectionId: ids.collectionId,
      expectedVersion: 1,
      access: "public",
      publicAccessAcknowledged: true,
      fields: [capability],
    });

    expect(configuration.access).toBe("protected");
    expect(publicUpdate.publicAccessAcknowledged).toBe(true);
  });

  it("returns complete snapshot data with stable publication metadata and no authoring fields", () => {
    const item = Schema.decodeUnknownSync(DeliveryItem)({
      id: ids.entryId,
      collectionId: ids.collectionId,
      collection: "articles",
      locale: "en",
      publication: {
        id: ids.publicationId,
        sequence: 2,
        schemaRevisionId: ids.revisionId,
        publishedAt: "2026-08-09T12:00:00.000Z",
      },
      data: { title: "Published", nested: { complete: true } },
    });

    expect(item.data).toEqual({ title: "Published", nested: { complete: true } });
    expect(Object.hasOwn(item, "displayName")).toBe(false);
    expect(Object.hasOwn(item, "actorId")).toBe(false);
  });

  it("uses cursor metadata without total counts or page numbers", () => {
    const page = Schema.decodeUnknownSync(DeliveryPage)({
      items: [],
      page: { limit: 20, nextCursor: null, hasMore: false },
    });

    expect(page.page).toEqual({ limit: 20, nextCursor: null, hasMore: false });
    expect(Object.hasOwn(page.page, "total")).toBe(false);
    expect(Object.hasOwn(page.page, "pageNumber")).toBe(false);
  });
});
