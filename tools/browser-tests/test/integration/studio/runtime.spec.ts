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

test("mounted Studio keeps representative 100-field interactions below the main-thread gate", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${fixture.origin}/studio`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Studio is connected")).toBeVisible();
  await page.getByRole("link", { name: "Content", exact: true }).click();
  await page.getByRole("link", { name: "English (en)" }).click();
  await page.getByRole("link", { name: "Create entry" }).click();
  await expect(page.getByRole("heading", { name: "Create entry" })).toBeVisible();
  await expect(page.getByLabel("Field 100")).toBeVisible();

  await page.evaluate(() => {
    Reflect.set(globalThis, "__studioLongTasks", []);
    const observer = new PerformanceObserver((list) => {
      const durations = Reflect.get(globalThis, "__studioLongTasks");
      if (Array.isArray(durations)) {
        for (const entry of list.getEntries()) durations.push(entry.duration);
      }
    });
    observer.observe({ type: "longtask", buffered: false });
    Reflect.set(globalThis, "__studioLongTaskObserver", observer);
  });

  for (let index = 1; index <= 12; index += 1) {
    await page.getByLabel(`Field ${index}`, { exact: true }).fill(`Value ${index}`);
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 100);
      }),
  );
  const longestTask = await page.evaluate(() => {
    const observer = Reflect.get(globalThis, "__studioLongTaskObserver");
    if (observer instanceof PerformanceObserver) observer.disconnect();
    const durations = Reflect.get(globalThis, "__studioLongTasks");
    return Array.isArray(durations)
      ? durations.reduce(
          (maximum, duration) =>
            typeof duration === "number" ? Math.max(maximum, duration) : maximum,
          0,
        )
      : 0;
  });
  expect(longestTask).toBeLessThan(100);
  await expect(page.getByText("Unsaved changes.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Discard changes and sign out?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();

  await page.getByLabel("Entry name").fill("Browser article");
  const createResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/entries"),
  );
  await page.getByRole("button", { name: "Create entry" }).click();
  const createResult = await createResponse;
  const createRequestBytes = createResult.request().postDataBuffer()?.byteLength ?? 0;
  expect(createResult.status(), `${createRequestBytes}: ${await createResult.text()}`).toBe(200);
  await expect(page.getByRole("heading", { name: "Edit entry" })).toBeVisible();
  const englishTab = page.getByRole("tab", { name: "English" });
  const frenchTab = page.getByRole("tab", { name: "French" });
  await expect(englishTab).toHaveAttribute("aria-selected", "true");
  await englishTab.focus();
  await englishTab.press("ArrowRight");
  await expect(frenchTab).toBeFocused();
  await expect(page.getByLabel("Field 1", { exact: true })).toHaveValue("Value 1");
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.getByLabel("Entry name").fill("Renamed browser article");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("Entry name saved.")).toBeVisible();
  await page.getByLabel("Field 13", { exact: true }).fill("Saved value");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.getByLabel("Field 100", { exact: true }).click();
  await page.getByRole("searchbox", { name: "Search Field 100" }).fill("Browser");
  await page.getByRole("button", { name: "Renamed browser article" }).click();
  await expect(page.locator(".studio-reference-current")).toHaveText("Renamed browser article");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await page.getByLabel("Field 14", { exact: true }).fill("Trigger conflict");
  const conflictResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().endsWith("/draft"),
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  const conflictResult = await conflictResponse;
  const conflictBody: unknown = await conflictResult.json();
  expect(conflictResult.status(), JSON.stringify(conflictBody)).toBe(409);
  await expect(page.getByText(/This draft changed elsewhere/u)).toBeVisible();
  await page.getByRole("button", { name: "Review latest changes" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Review latest draft changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep my change" }).click();
  await page.getByRole("button", { name: "Adopt reviewed changes" }).click();
  await expect(page.getByLabel("Field 14", { exact: true })).toHaveValue("Trigger conflict");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  const validationField = page.getByLabel("Field 15", { exact: true });
  await validationField.fill("Trigger validation");
  const validationResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().endsWith("/draft"),
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  const validationResult = await validationResponse;
  expect(JSON.stringify(await validationResult.json())).toContain('"status":"invalid"');
  await expect(page.getByText("This field value is invalid.")).toBeVisible();
  await expect(validationField).toBeFocused();
  await validationField.fill("Corrected value");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();

  await frenchTab.press("Enter");
  await expect(page.getByRole("tab", { name: "French" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Field 1", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const reflow = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 10)
      .map((element) => ({
        element: element.outerHTML.slice(0, 160),
        right: element.getBoundingClientRect().right,
      })),
  }));
  expect(reflow.overflow, JSON.stringify(reflow.offenders)).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.goto(
    `${fixture.origin}/studio/content/44444444-4444-4444-8444-444444444444/locales/en/entries/${"d".repeat(8)}-${"d".repeat(4)}-4ddd-8ddd-${"d".repeat(12)}`,
  );
  await expect(page.getByRole("heading", { name: "Entry route unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose content" })).toBeVisible();
});
