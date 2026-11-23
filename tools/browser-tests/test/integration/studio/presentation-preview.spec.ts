import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  startStudioBrowserFixture,
  type StudioBrowserFixture,
} from "../../support/studio/runtime-fixture";

let fixture: StudioBrowserFixture;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fixture = await startStudioBrowserFixture();
});

test.afterAll(async () => {
  await fixture.close();
});

async function signIn(page: Page) {
  await page.goto(`${fixture.origin}/studio`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Studio is connected")).toBeVisible();
  await page.getByRole("link", { name: "Content", exact: true }).click();
}

test("mounted Studio publishes an editorial form layout", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Edit form layout" }).click();
  await expect(page.getByRole("heading", { name: "Form layout" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations).toEqual([]);

  const firstLabel = page.getByLabel("Label", { exact: true }).first();
  await firstLabel.fill("Headline");
  await page.getByRole("button", { name: "Publish form layout" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Publish the form layout?" });
  await expect(confirm.getByText("Who can see each field does not change.")).toBeVisible();
  await confirm.getByRole("button", { name: "Publish form layout" }).click();
  await expect(page.getByText("Form layout published as revision 2.")).toBeVisible();
  await expect(page.getByLabel("Label", { exact: true }).first()).toHaveValue("Headline");
});

test("mounted Studio previews the current draft and a historical revision", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "English (en)" }).click();
  await page.getByRole("link", { name: "Create entry" }).click();
  await page.getByLabel("Entry name").fill("Preview article");
  await page.getByLabel("Field 1", { exact: true }).fill("First value");
  await page.getByRole("button", { name: "Create entry" }).click();
  await expect(page.getByRole("heading", { name: "Edit entry" })).toBeVisible();

  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(page.getByText("Preview shows the last saved draft.")).toBeVisible();
  const frame = page.frameLocator('iframe[title="Preview of Preview article"]');
  await expect(frame.getByRole("heading", { name: "Rendered current preview" })).toBeVisible();
  const iframe = page.locator('iframe[title="Preview of Preview article"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  expect(await page.content()).not.toContain("ffd_pvh_");

  await page.getByLabel("Field 1", { exact: true }).fill("Second value");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await expect(
    page.getByText("The draft changed after this preview loaded. Reload the preview."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Show history" }).click();
  await page.getByRole("button", { name: "Preview revision 1" }).click();
  await expect(page.getByText("Preview shows English revision 1.")).toBeVisible();
  await expect(frame.getByRole("heading", { name: "Rendered revision preview" })).toBeVisible();
  expect(fixture.renderedTokens.every((token) => token.startsWith("ffd_pvh_"))).toBe(true);
  expect(fixture.renderedTokens.length).toBeGreaterThanOrEqual(2);
  expect(await page.content()).not.toContain("ffd_pvh_");
});
