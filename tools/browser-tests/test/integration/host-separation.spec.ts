import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { browserTestOrigins } from "../support/preflight";
import { observeRuntimeErrors } from "../support/runtime-diagnostics";

const origins = browserTestOrigins();

function url(path: string, origin: URL) {
  return new URL(path, origin).toString();
}

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
}

test("crosses only the validated marketing login entry to the dashboard", async ({ page }) => {
  const diagnostics = observeRuntimeErrors(page);
  const response = await page.goto(
    url("/login?next=%2Fprojects%2Fproject-1%3Ftab%3Doperations", origins.marketing),
  );

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL((current) => {
    return (
      current.origin === origins.dashboard.origin &&
      current.pathname === "/login" &&
      current.searchParams.get("returnTo") === "/projects/project-1?tab=operations"
    );
  });
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  diagnostics.expectNone();
});

test("keeps an unsafe marketing redirect corpus on the marketing origin", async ({ request }) => {
  const unsafeSearches = [
    "next=https%3A%2F%2Fattacker.example%2Fpath",
    "next=%2F%2Fattacker.example%2Fpath",
    "next=%2F%5Cattacker.example%2Fpath",
    "next=%2Flogin%3FreturnTo%3D%2Fdashboard",
    "next=%2Fapi%2Fauth%2Fget-session",
    "next=%2Fprojects%252fproject-1",
    "next=%2Fprojects%23proof",
    "next=%2Fdashboard&next=%2Fprojects%2Fproject-1",
    "next=%2Fdashboard&campaign=untrusted",
  ];

  for (const search of unsafeSearches) {
    const response = await request.get(url(`/login?${search}`, origins.marketing), {
      maxRedirects: 0,
    });
    expect(response.status(), search).toBe(404);
    expect(response.headers()["location"], search).toBeUndefined();
    expect(response.headers()["cache-control"], search).toBe("no-store");
  }
});

test("does not send a dashboard host-only cookie or auth storage to public surfaces", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "m17-host-only-probe",
      value: "opaque",
      url: origins.dashboard.origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(url("/", origins.marketing));
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
  expect(
    (await context.cookies(origins.marketing.origin)).map((cookie) => cookie.name),
  ).not.toContain("m17-host-only-probe");
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });

  await page.goto(url("/docs", origins.developers));
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  expect(
    (await context.cookies(origins.developers.origin)).map((cookie) => cookie.name),
  ).not.toContain("m17-host-only-probe");
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test("keeps public landing, docs, and invalid-login states accessible", async ({ page }) => {
  await page.goto(url("/", origins.marketing));
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  const invalid = await page.goto(
    url("/login?next=https%3A%2F%2Fattacker.example%2Fpath", origins.marketing),
  );
  expect(invalid?.status()).toBe(404);
  await expectNoAccessibilityViolations(page);

  await page.goto(url("/docs", origins.developers));
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("publishes canonical indexing policy for each hosted surface", async ({ page, request }) => {
  await page.goto(url("/", origins.marketing));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3003/",
  );
  const marketingRobots = await request.get(url("/robots.txt", origins.marketing));
  const marketingSitemap = await request.get(url("/sitemap.xml", origins.marketing));
  expect(marketingRobots.status()).toBe(200);
  expect(await marketingRobots.text()).toContain("Allow: /");
  expect(marketingSitemap.status()).toBe(200);
  expect(await marketingSitemap.text()).toContain("https://framerfordevs.com/");

  await page.goto(url("/docs", origins.developers));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:3002/docs/",
  );

  await page.goto(url("/login", origins.dashboard));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  const dashboardRobots = await request.get(url("/robots.txt", origins.dashboard));
  expect(dashboardRobots.status()).toBe(200);
  expect(await dashboardRobots.text()).toContain("Disallow: /");
});

test("opens accessible dashboard recovery routes directly", async ({ page }) => {
  const diagnostics = observeRuntimeErrors(page);

  await page.goto(url("/device", origins.dashboard));
  await expect(page.getByRole("heading", { name: "Authorize a device" })).toBeVisible();
  await expect(page.getByLabel("Device code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.goto(url("/invitations/accept", origins.dashboard));
  await expect(page.getByText("Invitation unavailable", { exact: true })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.goto(url("/login", origins.dashboard));
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  await expectNoAccessibilityViolations(page);
  diagnostics.expectNone();
});
