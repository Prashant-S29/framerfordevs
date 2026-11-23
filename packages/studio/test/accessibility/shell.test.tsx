// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioNotFound, StudioShell } from "../../src/app/shell";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    Link: ({
      children,
      className,
    }: {
      readonly children: ReactNode;
      readonly className?: string;
    }) => (
      <a className={className} href="/content">
        {children}
      </a>
    ),
  };
});

const response = {
  ok: true,
  data: {
    formatVersion: 1,
    host: {
      kind: "mounted",
      registration: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 3,
        applicationOrigin: "http://localhost:4100",
        mountPath: "/studio",
      },
    },
    project: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Website",
      workspaceId: "44444444-4444-4444-8444-444444444444",
    },
    environment: {
      id: "33333333-3333-4333-8333-333333333333",
      key: "main",
      name: "main",
    },
    user: { id: "studio-user", name: "Studio User", email: "studio@example.test" },
    role: "editor",
    effectiveActions: ["project.read"],
    session: { expiresAt: "2026-09-27T12:05:00.000Z" },
  },
  error: null,
  message: "Studio bootstrap loaded.",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Studio shell accessibility", () => {
  it("renders the connected empty state without serious violations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(response))),
    );
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell
          mountPath="/studio"
          host="mounted"
          dashboardOrigin="https://dashboard.example.test"
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Studio is connected");
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });

  it.each([
    ["STUDIO_FORBIDDEN", "Access denied"],
    ["STUDIO_PROJECT_UNAVAILABLE", "Studio needs attention"],
    ["STUDIO_CMS_DISABLED", "Studio needs attention"],
    ["STUDIO_REGISTRATION_INACTIVE", "Studio needs attention"],
    ["STUDIO_ROUTE_NOT_FOUND", "Studio is unavailable"],
    ["STUDIO_UPSTREAM_UNAVAILABLE", "Studio is unavailable"],
  ])("renders bounded recovery for %s", async (code, heading) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              data: null,
              error: { code, message: "Bounded failure." },
              message: "Bounded failure.",
            }),
            { status: 403 },
          ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell
          mountPath="/studio"
          host="mounted"
          dashboardOrigin="https://dashboard.example.test"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open dashboard/iu })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("offers sign-in recovery for an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              data: null,
              error: { code: "STUDIO_AUTH_REQUIRED", message: "Authentication required." },
              message: "Authentication required.",
            }),
            { status: 401 },
          ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell
          mountPath="/studio"
          host="mounted"
          dashboardOrigin="https://dashboard.example.test"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
    expect(screen.getByRole("link", { name: /open dashboard/iu }).getAttribute("href")).toBe(
      "https://dashboard.example.test",
    );
  });

  it("keeps logout failure recoverable and preserves dashboard-session copy", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(response)))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell
          mountPath="/studio"
          host="mounted"
          dashboardOrigin="https://dashboard.example.test"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/leaves your dashboard session active/iu)).toBeTruthy();
    screen.getByRole("button", { name: "Sign out" }).click();
    expect((await screen.findByRole("status")).textContent).toMatch(/could not be completed/iu);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Sign out" }).disabled).toBe(
      false,
    );
  });

  it("renders an accessible not-found recovery state", async () => {
    const view = render(
      <StudioNotFound host="mounted" dashboardOrigin="https://dashboard.example.test" />,
    );
    expect(screen.getByRole("heading", { name: "Studio page not found" })).toBeTruthy();
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });

  it("hides sign-out and shows the schema drift notice in the local editor", async () => {
    const local = { ...response, data: { ...response.data, host: { kind: "local_editor" } } };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith("/api/editor/status")
        ? new Response(
            JSON.stringify({
              ok: true,
              data: { schema: "differs", diagnosticCode: null },
              error: null,
              message: "Local editor status loaded.",
            }),
          )
        : new Response(JSON.stringify(local)),
    );
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell mountPath="/studio" host="local_editor" dashboardOrigin={null} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/uses your CLI login/iu)).toBeTruthy();
    expect(
      await screen.findByRole("heading", {
        name: "The local schema differs from the hosted schema",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("link", { name: /open dashboard/iu })).toBeNull();
    expect(screen.getByText("Local editor")).toBeTruthy();
    const results = await axe.run(view.container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.filter((violation) => violation.impact === "serious")).toEqual([]);
  });

  it("tells a local editor user to sign in with the CLI instead of the browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              data: null,
              error: { code: "STUDIO_AUTH_REQUIRED", message: "Authentication required." },
              message: "Authentication required.",
            }),
            { status: 401 },
          ),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell mountPath="/studio" host="local_editor" dashboardOrigin={null} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/run ffd login/iu)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
