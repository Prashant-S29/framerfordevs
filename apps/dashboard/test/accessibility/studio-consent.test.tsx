/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => vi.fn());
const publicClientPrelogin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      isPending: false,
      data: { user: { id: "studio-user", name: "Studio User" } },
    }),
    oauth2: { consent, publicClientPrelogin },
  },
}));

import { OAuthConsentPage } from "@/routes/oauth/consent";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Studio OAuth acknowledgement accessibility", () => {
  it("names the exact project application and requires explicit Allow or Deny", async () => {
    const registrationId = "019fae8b-1234-7000-8000-000000000009";
    window.history.replaceState(
      {},
      "",
      `/oauth/consent?client_id=ffd-studio-v1-${registrationId}&sig=signed`,
    );
    publicClientPrelogin.mockResolvedValue({
      data: {
        client_id: `ffd-studio-v1-${registrationId}`,
        client_name: "Customer Site Studio",
        client_uri: "https://application.example.test",
      },
      error: null,
    });

    const { container } = render(<OAuthConsentPage />);

    expect(
      await screen.findByRole("heading", { name: "Allow Studio access to Customer Site Studio?" }),
    ).toBeTruthy();
    expect(screen.getByText("https://application.example.test")).toBeTruthy();
    expect(screen.getByText(/asked again for every new local Studio session/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
    await waitFor(async () => expect((await axe.run(container)).violations).toEqual([]));
    expect(publicClientPrelogin).toHaveBeenCalledWith({
      client_id: `ffd-studio-v1-${registrationId}`,
    });
  });
});
