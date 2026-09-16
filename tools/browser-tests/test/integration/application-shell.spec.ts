import { expect, test } from "@playwright/test";

import { observeRuntimeErrors } from "../support/runtime-diagnostics";

const invitationToken = "b".repeat(43);

test("loads the public application shell without browser runtime errors", async ({ page }) => {
  const diagnostics = observeRuntimeErrors(page);
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Structured content and website operations without giving up your stack.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  const favicon = await page.request.get("/favicon.svg");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  diagnostics.expectNone();
});

test("redirects an unauthenticated protected deep link without hydration errors", async ({
  page,
}) => {
  const diagnostics = observeRuntimeErrors(page);
  await page.goto("/dashboard?status=active");

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/login" && url.searchParams.get("returnTo") === "/dashboard?status=active"
    );
  });
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  diagnostics.expectNone();
});

test("validates sign-up and sign-in fields through user-visible controls", async ({ page }) => {
  const diagnostics = observeRuntimeErrors(page);
  await page.goto("/login");

  await page.getByLabel("Name").fill("A");
  await page.getByLabel("Email").fill("browser.test@example.test");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();

  await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();

  await page.getByRole("button", { name: "Already have an account? Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  await page.getByLabel("Email").fill("browser.test@example.test");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
  diagnostics.expectNone();
});

test("keeps invitation proof in the fragment and out of browser requests", async ({ page }) => {
  const diagnostics = observeRuntimeErrors(page);
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));

  await page.goto(`/invitations/accept#token=${invitationToken}`);
  await expect(page.getByText("Sign in to review this invitation", { exact: true })).toBeVisible();

  const continueLink = page.getByRole("link", { name: "Continue to sign in" });
  await expect(continueLink).toHaveAttribute("href", `/login#token=${invitationToken}`);
  await continueLink.click();
  await expect(page).toHaveURL(`/login#token=${invitationToken}`);
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

  expect(requestedUrls.some((url) => url.includes(invitationToken))).toBe(false);
  diagnostics.expectNone();
});
