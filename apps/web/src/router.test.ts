import { describe, expect, it } from "vitest";

import { getRouter } from "./router";

describe("route structure", () => {
  it("renders the collection schema builder outside the project detail component tree", () => {
    const router = getRouter();
    const schemaRoute = router.routesById["/_auth/projects/$projectId_/collections/$collectionId"];

    expect(schemaRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId");
    expect(schemaRoute.parentRoute.id).toBe("/_auth");
  });
});
