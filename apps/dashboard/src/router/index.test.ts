import { describe, expect, it } from "vitest";

import { getRouter } from "./index";

describe("route structure", () => {
  it("keeps the structure and Webhooks workspaces outside the project detail tree", () => {
    const router = getRouter();
    const loginRoute = router.routesById["/login"];
    const authenticatedRoute = router.routesById["/_auth"];
    const schemaRoute = router.routesById["/_auth/projects/$projectId_/collections/$collectionId"];
    const webhooksRoute = router.routesById["/_auth/projects/$projectId_/webhooks"];

    expect(loginRoute.options.ssr).toBe(false);
    expect(authenticatedRoute.options.ssr).toBe("data-only");
    expect(schemaRoute.fullPath).toBe("/projects/$projectId/collections/$collectionId");
    expect(webhooksRoute.fullPath).toBe("/projects/$projectId/webhooks");
    expect(schemaRoute.parentRoute.id).toBe("/_auth");
    expect(webhooksRoute.parentRoute.id).toBe("/_auth");
    const validateWebhookSearch = webhooksRoute.options.validateSearch;
    expect(typeof validateWebhookSearch).toBe("function");
    if (typeof validateWebhookSearch !== "function")
      throw new Error("Webhook search validator is missing.");
    expect(
      validateWebhookSearch({
        endpoint: "019fae8b-1234-7000-8000-000000000071",
        event: "cms.entry.published",
        status: "dead_letter",
      }),
    ).toEqual({
      endpoint: "019fae8b-1234-7000-8000-000000000071",
      event: "cms.entry.published",
      status: "dead_letter",
    });
    expect(
      validateWebhookSearch({ endpoint: "invalid", event: "internal.event", status: "failed" }),
    ).toEqual({});
  });

  it("has no editorial or Preview routes in the hosted dashboard", () => {
    const routeIds = Object.keys(getRouter().routesById);
    expect(routeIds.filter((id) => /\/(?:entries|presentation|preview)\b/u.test(id))).toEqual([]);
  });
});
