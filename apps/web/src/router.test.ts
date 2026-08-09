import { describe, expect, it } from "vitest";

import { getRouter } from "./router";

describe("route structure", () => {
  it("keeps schema, entry list, and editor workspaces outside the project detail tree", () => {
    const router = getRouter();
    const schemaRoute = router.routesById["/_auth/projects/$projectId_/collections/$collectionId"];
    const entriesRoute =
      router.routesById["/_auth/projects/$projectId_/collections/$collectionId_/entries"];
    const editorRoute =
      router.routesById["/_auth/projects/$projectId_/collections/$collectionId_/entries_/$entryId"];

    expect(schemaRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId");
    expect(entriesRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId/entries");
    expect(editorRoute.fullPath).toBe(
      "/projects/$projectId/collections/$collectionId/entries/$entryId",
    );
    expect(schemaRoute.parentRoute.id).toBe("/_auth");
    expect(entriesRoute.parentRoute.id).toBe("/_auth");
    expect(editorRoute.parentRoute.id).toBe("/_auth");
    const validateSearch = editorRoute.options.validateSearch;
    expect(typeof validateSearch).toBe("function");
    if (typeof validateSearch !== "function")
      throw new Error("Editor search validator is missing.");
    expect(validateSearch({ locale: "hi" })).toEqual({ locale: "hi" });
    expect(validateSearch({ locale: 42 })).toEqual({ locale: "" });
  });
});
