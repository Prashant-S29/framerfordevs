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

async function openEnglishEntries(page: Page) {
  await page.goto(`${fixture.origin}/studio`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Studio is connected")).toBeVisible();
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByRole("link", { name: "English (en)" }).click();
}

async function openHistoryArticle(page: Page) {
  await openEnglishEntries(page);
  await page.getByRole("link", { name: /History article/u }).click();
  await expect(page.getByRole("heading", { name: "Edit entry" })).toBeVisible();
}

function publicationBadge(page: Page) {
  return page.locator(".studio-publication-badge").first();
}

test("mounted Studio lists history, opens a read-only revision, and compares it with the draft", async ({
  page,
}) => {
  await openEnglishEntries(page);
  await page.getByRole("link", { name: "Create entry" }).click();
  await page.getByLabel("Entry name").fill("History article");
  await page.getByLabel("Field 1", { exact: true }).fill("First value");
  await page.getByRole("button", { name: "Create entry" }).click();
  await expect(page.getByRole("heading", { name: "Edit entry" })).toBeVisible();
  await expect(publicationBadge(page)).toHaveText("Publication status: Never published");

  await page.getByLabel("Field 1", { exact: true }).fill("Second value");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  const toggle = page.getByRole("button", { name: "Show history" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Hide history" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const history = page.getByRole("list", { name: "English revisions" });
  await expect(history.getByText("Revision 2 (current draft)")).toBeVisible();
  await expect(history.getByText("Revision 1", { exact: true })).toBeVisible();
  await expect(history.getByText("Changed Field 1").first()).toBeVisible();
  await expect(history.getByText(/^You ·/u).first()).toBeVisible();

  await page.getByRole("button", { name: "View revision 1", exact: true }).click();
  const viewDialog = page.getByRole("dialog", { name: "Revision 1" });
  await expect(viewDialog.getByText("First value")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewDialog).toBeHidden();

  await page.getByRole("button", { name: "Compare revision 1 with current draft" }).click();
  const compareDialog = page.getByRole("dialog", {
    name: "Compare revision 1 with current draft",
  });
  await expect(compareDialog.getByText("Revision 1: First value")).toBeVisible();
  await expect(compareDialog.getByText("Current draft: Second value")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(compareDialog).toBeHidden();
});

test("mounted Studio validates before publishing and shows the Delivery read-back", async ({
  page,
}) => {
  await openHistoryArticle(page);
  await page.getByLabel("Field 2", { exact: true }).fill("Block publication");
  await expect(page.getByRole("button", { name: "Check publication" })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await page.getByRole("button", { name: "Check publication" }).click();
  const issues = page.getByRole("list", { name: "Publication issues" });
  await expect(issues.getByText("Field 2: This field value is invalid.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish English" })).toHaveCount(0);

  await page.getByLabel("Field 2", { exact: true }).fill("Ready");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await page.getByRole("button", { name: "Check publication" }).click();
  await expect(page.getByText("The saved draft is ready to publish in English.")).toBeVisible();
  await page.getByRole("button", { name: "Publish English" }).click();
  await expect(
    page.getByText(/Published\. Delivery now serves publication 1 for English\./u),
  ).toBeVisible();
  await expect(publicationBadge(page)).toHaveText("Publication status: Published");
});

test("mounted Studio restores a revision after confirmation and unpublishes one locale", async ({
  page,
}) => {
  await openHistoryArticle(page);
  await expect(publicationBadge(page)).toHaveText("Publication status: Published");
  await page.getByRole("button", { name: "Show history" }).click();
  await page.getByRole("button", { name: "Restore revision 1" }).click();
  const restoreDialog = page.getByRole("alertdialog", { name: "Restore revision 1?" });
  await expect(restoreDialog).toBeVisible();
  await restoreDialog.getByRole("button", { name: "Restore revision" }).click();
  await expect(page.getByText(/Revision 1 restored as the current English draft/u)).toBeVisible();
  await expect(page.getByLabel("Field 1", { exact: true })).toHaveValue("First value");
  await expect(publicationBadge(page)).toHaveText("Publication status: Changed since publish");

  await page.getByRole("button", { name: "Unpublish English" }).click();
  const unpublishDialog = page.getByRole("alertdialog", { name: "Unpublish English?" });
  await expect(unpublishDialog).toBeVisible();
  await unpublishDialog.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText(/Delivery no longer serves this entry in English/u)).toBeVisible();
  await expect(publicationBadge(page)).toHaveText("Publication status: Unpublished");
  await expect(page.getByRole("button", { name: "Unpublish English" })).toHaveCount(0);
  await expect(unpublishDialog).toBeHidden();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
