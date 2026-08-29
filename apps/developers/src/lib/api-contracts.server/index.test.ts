// Proves generated API-reference pages preserve canonical operation paths and the closed family allowlist.

import authoringDocument from "@framerfordevs/public-contracts/artifacts/authoring/v1/openapi.json";
import deliveryDocument from "@framerfordevs/public-contracts/artifacts/delivery/v1/openapi.json";
import previewDocument from "@framerfordevs/public-contracts/artifacts/preview/v1/openapi.json";
import toolingDocument from "@framerfordevs/public-contracts/artifacts/tooling/v1/openapi.json";
import { describe, expect, it } from "vitest";

import { apiContractSource } from "./index";

const references = [
  { document: authoringDocument, slugs: ["authoring", "v1"] },
  { document: deliveryDocument, slugs: ["delivery", "v1"] },
  { document: previewDocument, slugs: ["preview", "v1"] },
  { document: toolingDocument, slugs: ["tooling", "v1"] },
];

describe("canonical API contract source", () => {
  it("contains exactly the four public OpenAPI families", () => {
    expect(
      apiContractSource
        .getPages()
        .map((page) => page.url)
        .toSorted(),
    ).toEqual([
      "/api-reference/authoring/v1",
      "/api-reference/delivery/v1",
      "/api-reference/preview/v1",
      "/api-reference/tooling/v1",
    ]);
  });

  it.each(references)("preserves every canonical path for $slugs", ({ document, slugs }) => {
    const page = apiContractSource.getPage([...slugs]);
    expect(page).toBeDefined();
    if (page === undefined) return;

    expect(Object.keys(page.data.getSchema().bundled.paths ?? {}).toSorted()).toEqual(
      Object.keys(document.paths).toSorted(),
    );
  });
});
