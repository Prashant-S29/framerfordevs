import { describe, expect, it } from "vitest";

import { getRouter } from "./router";

describe("route structure", () => {
  it("keeps schema, entry list, editor, and Preview workspaces outside the project detail tree", () => {
    const router = getRouter();
    const schemaRoute = router.routesById["/_auth/projects/$projectId_/collections/$collectionId"];
    const entriesRoute =
      router.routesById["/_auth/projects/$projectId_/collections/$collectionId_/entries"];
    const editorRoute =
      router.routesById["/_auth/projects/$projectId_/collections/$collectionId_/entries_/$entryId"];
    const previewRoute =
      router.routesById[
        "/_auth/projects/$projectId_/collections/$collectionId_/entries_/$entryId_/preview"
      ];

    expect(schemaRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId");
    expect(entriesRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId/entries");
    expect(editorRoute.fullPath).toBe(
      "/projects/$projectId/collections/$collectionId/entries/$entryId",
    );
    expect(previewRoute.fullPath).toBe(
      "/projects/$projectId/collections/$collectionId/entries/$entryId/preview",
    );
    expect(schemaRoute.parentRoute.id).toBe("/_auth");
    expect(entriesRoute.parentRoute.id).toBe("/_auth");
    expect(editorRoute.parentRoute.id).toBe("/_auth");
    expect(previewRoute.parentRoute.id).toBe("/_auth");
    const validateSearch = editorRoute.options.validateSearch;
    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function")
      throw new Error("Editor search validator is missing.");
    expect(validateSearch({ locale: "hi" })).toEqual({ locale: "hi" });
    expect(validateSearch({ locale: 42 })).toEqual({ locale: "" });
    const validatePreviewSearch = previewRoute.options.validateSearch;
    expect(typeof validatePreviewSearch).toBe("function");
    if (typeof validatePreviewSearch !== "function")
      throw new Error("Preview search validator is missing.");
    expect(validatePreviewSearch({ locale: "gu", source: "current" })).toEqual({
      locale: "gu",
      source: "current",
    });
    expect(
      validatePreviewSearch({
        locale: "gu",
        source: "revision",
        schemaRevisionId: "invalid",
        sharedRevision: "none",
        localizedRevision: "invalid",
      }),
    ).toEqual({
      locale: "gu",
      source: "revision",
      sharedRevision: "none",
    });
  });
});
