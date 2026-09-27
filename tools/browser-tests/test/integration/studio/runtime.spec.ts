import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  startStudioBrowserFixture,
  type StudioBrowserFixture,
} from "../../support/studio/runtime-fixture";

let fixture: StudioBrowserFixture;

test.beforeAll(async () => {
  fixture = await startStudioBrowserFixture();
});

test.afterAll(async () => {
  await fixture.close();
});

test("mounted Studio completes sign-in and renders an accessible responsive shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture.origin}/studio`);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await expect(page.getByText("Studio is connected")).toBeVisible();
  await expect(page.getByText("Browser Studio")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
