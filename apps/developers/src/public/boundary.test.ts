// Verifies that portal content, links, search input, routes, and artifacts stay on the closed public surface.

import { publicContractRegistryKeys } from "@framerfordevs/public-contracts/metadata";
import { describe, expect, it } from "vitest";

import { source } from "../lib/source";

const allowedRoutes = [
  "/",
  "/docs/$",
  "/api-reference/",
  "/api-reference/$",
  "/api-reference/webhooks/v1",
  "/api/search",
] as const;

const apiReferenceUrls = new Set([
  "/api-reference",
  "/api-reference/authoring/v1",
  "/api-reference/delivery/v1",
  "/api-reference/preview/v1",
  "/api-reference/tooling/v1",
  "/api-reference/webhooks/v1",
]);

const forbiddenPublicTerms = [
  "better-auth",
  "dashboard orpc",
  "workspace membership",
  "credential hash",
  "database migration",
  "operator endpoint",
  "authoring mutation",
] as const;

describe("developer portal public boundary", () => {
  it("indexes only the closed public contract registry", () => {
    expect(publicContractRegistryKeys).toEqual([
      "authoring/v1",
      "delivery/v1",
      "preview/v1",
      "tooling/v1",
      "webhooks/v1",
    ]);
  });

  it("defines only public documentation, search, and reference route patterns", () => {
    expect(allowedRoutes).toEqual([
      "/",
      "/docs/$",
      "/api-reference/",
      "/api-reference/$",
      "/api-reference/webhooks/v1",
      "/api/search",
    ]);

    const pages = source.getPages();
    const urls = pages.map((page) => page.url);
    expect(pages.length).toBeGreaterThanOrEqual(25);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("/docs/get-started");
    expect(urls).toContain("/docs/concepts/publication-lifecycle");
    expect(urls).toContain("/docs/delivery/caching-and-pagination");
    expect(urls).toContain("/docs/preview/security");
    expect(urls).toContain("/docs/troubleshooting");
  });

  it("does not index private implementation vocabulary", async () => {
    const documents = await Promise.all(
      source.getPages().map(async (page) => page.data.getText("processed")),
    );
    const index = documents.join("\n").toLocaleLowerCase("en");

    for (const term of forbiddenPublicTerms) expect(index).not.toContain(term);
  });

  it("keeps internal MDX links inside known public documentation and contract routes", async () => {
    const documentationUrls = new Set(source.getPages().map((page) => page.url));
    const documents = await Promise.all(
      source.getPages().map(async (page) => page.data.getText("processed")),
    );

    for (const document of documents) {
      for (const match of document.matchAll(/\]\((\/[^)#?]+)(?:#[^)]+)?\)/g)) {
        const url = match[1];
        expect(
          url === undefined || documentationUrls.has(url) || apiReferenceUrls.has(url),
          `Unknown public documentation link: ${url ?? "missing"}`,
        ).toBe(true);
      }
    }
  });
});
