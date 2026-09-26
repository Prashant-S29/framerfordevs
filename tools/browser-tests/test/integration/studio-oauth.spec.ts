import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type { StudioOAuthAttempt } from "@framerfordevs/studio-oauth-harness";

import { createStudioBrowserFixture, type StudioBrowserFixture } from "../support/studio-fixture";

async function signInThroughApi(page: Page, fixture: StudioBrowserFixture) {
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: "http://localhost:3001" },
    data: { email: fixture.email, password: fixture.password },
  });
  expect(response.ok()).toBe(true);
}

async function beginAuthorization(page: Page, fixture: StudioBrowserFixture) {
  const attempt = fixture.harness.begin();
  await page.goto(attempt.authorizationUrl);
  return attempt;
}

async function interceptCallback(
  page: Page,
  fixture: StudioBrowserFixture,
  attempt: StudioOAuthAttempt,
) {
  let callbackUrl = "";
  await page.route(`${fixture.applicationOrigin}/studio/auth/callback**`, async (route) => {
    callbackUrl = route.request().url();
    fixture.harness.callback(callbackUrl, attempt);
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Studio callback</title><script>history.replaceState({}, '', '/studio')</script><main>Authorization completed.</main>",
    });
  });
  return () => callbackUrl;
}

async function exchangeAndBootstrap(
  fixture: StudioBrowserFixture,
  attempt: StudioOAuthAttempt,
  location: string,
) {
  const callback = fixture.harness.callback(location, attempt);
  const response = await fetch("http://localhost:3000/api/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: fixture.harness.tokenBody(callback, attempt),
    redirect: "manual",
  });
  expect(response.ok).toBe(true);
  const token = fixture.harness.decodeTokenResponse(await response.json());
  const bootstrap = await fetch(fixture.harness.bootstrapRequest(token.accessToken));
  expect(bootstrap.ok).toBe(true);
  const body: unknown = await bootstrap.json();
  expect(body).toMatchObject({
    ok: true,
    data: {
      registration: { id: fixture.registrationId },
      project: { id: fixture.projectId, name: "Browser Customer Site" },
      environment: { id: fixture.environmentId, key: "main" },
    },
  });
}

let sharedFixture: StudioBrowserFixture | undefined;

async function getStudioBrowserFixture() {
  sharedFixture ??= await createStudioBrowserFixture();
  return sharedFixture;
}

test.afterAll(async () => {
  await sharedFixture?.cleanup();
});

test("requires an exact accessible acknowledgement and completes callback cleanup plus bootstrap", async ({
  page,
}) => {
  const fixture = await getStudioBrowserFixture();
  await signInThroughApi(page, fixture);
  const attempt = fixture.harness.begin();
  const callbackLocation = await interceptCallback(page, fixture, attempt);
  await page.goto(attempt.authorizationUrl);

  const heading = page.getByRole("heading", {
    name: "Allow Studio access to Browser Customer Site Studio?",
  });
  await expect(heading).toBeFocused();
  await expect(page.getByText(fixture.applicationOrigin, { exact: true })).toBeVisible();
  await expect(page.getByText(/asked again for every new local Studio session/i)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Allow" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.url()).toBe(`${fixture.applicationOrigin}/studio`);
  expect(callbackLocation()).not.toBe("");
  expect(page.url()).not.toContain("code=");
  expect(page.url()).not.toContain("state=");
  await exchangeAndBootstrap(fixture, attempt, callbackLocation());
});

test("continues unauthenticated login to acknowledgement and preserves explicit denial", async ({
  page,
}) => {
  const fixture = await getStudioBrowserFixture();
  const attempt = await beginAuthorization(page, fixture);
  await expect(page).toHaveURL(/\/login\?/u);
  await page.getByRole("button", { name: /Already have an account\? Sign In/i }).click();
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  const signInResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const completedSignIn = await signInResponse;
  expect(completedSignIn.status()).toBe(200);
  const heading = page.getByRole("heading", {
    name: /Allow Studio access to Browser Customer Site Studio/u,
  });
  await expect(heading).toBeFocused();

  let deniedCallback = "";
  await page.route(`${fixture.applicationOrigin}/studio/auth/callback**`, async (route) => {
    deniedCallback = route.request().url();
    await route.fulfill({ contentType: "text/html", body: "<main>Authorization denied.</main>" });
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Allow" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Deny" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => deniedCallback).not.toBe("");
  const callback = new URL(deniedCallback);
  expect(callback.searchParams.get("error")).toBe("access_denied");
  expect(callback.searchParams.get("state")).toBe(attempt.state);
  expect(callback.searchParams.has("code")).toBe(false);
});

test("does not bypass acknowledgement and fails registration drift closed", async ({ page }) => {
  const fixture = await getStudioBrowserFixture();
  await signInThroughApi(page, fixture);
  const first = fixture.harness.begin();
  await interceptCallback(page, fixture, first);
  await page.goto(first.authorizationUrl);
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => page.url()).toBe(`${fixture.applicationOrigin}/studio`);

  const second = fixture.harness.begin();
  await page.goto(second.authorizationUrl);
  await expect(
    page.getByRole("heading", { name: /Allow Studio access to Browser Customer Site Studio/u }),
  ).toBeFocused();
  await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();

  await fixture.updateRegistrationOrigin();
  await page.getByRole("button", { name: "Allow" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText(/could not be completed/i);
  const recovery = page.getByRole("link", { name: "Return to the dashboard" });
  await expect(recovery).toHaveAttribute("href", "/dashboard");
  await page.keyboard.press("Tab");
  await expect(recovery).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\?status=active$/u);
});
