// Exercises representative compiled MDX with axe while keeping the test independent of hosted services.

// @vitest-environment jsdom

import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useMDXComponents } from "./components/mdx";
import { docs, source } from "./lib/source";

describe("compiled public documentation accessibility", () => {
  it("has no detectable violations in the first-success guide", async () => {
    const sourcePage = source.getPage(["get-started"]);
    expect(sourcePage).toBeDefined();
    if (sourcePage === undefined) return;

    const page = docs.getPage(sourcePage.path);
    expect(page).toBeDefined();
    if (page === undefined) return;

    await page.load();
    const MDX = page.body;
    document.body.innerHTML = renderToStaticMarkup(
      <main>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
        <MDX components={useMDXComponents()} />
      </main>,
    );

    const result = await axe.run(document.body);
    expect(result.violations).toEqual([]);
  }, 10_000);
});
