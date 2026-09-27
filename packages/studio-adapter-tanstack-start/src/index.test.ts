import { describe, expect, it, vi } from "vitest";

import { createTanStackStartStudioHandler } from ".";
import type { StudioFetchHandler } from "@framerfordevs/studio-server";

function fixture(fetch: StudioFetchHandler["fetch"]): StudioFetchHandler {
  return {
    mountPath: "/studio",
    applicationOrigin: "https://app.example.test",
    fetch,
    dispose: async () => undefined,
  };
}

describe("TanStack Start Studio adapter", () => {
  it("passes the host-provided raw target unchanged to the Fetch core", async () => {
    const fetch = vi.fn(async (_request: Request, context: { readonly rawTarget: string }) => {
      const headers = new Headers({ "X-Studio": "fixture" });
      headers.append("Set-Cookie", "one=1; Path=/studio; HttpOnly");
      headers.append("Set-Cookie", "two=2; Path=/studio; HttpOnly");
      return new Response(context.rawTarget, { status: 202, headers });
    });
    const handler = createTanStackStartStudioHandler(fixture(fetch));
    const response = await handler({
      request: new Request("https://app.example.test/studio/auth/callback?state=a%2Fb"),
      rawTarget: "/studio/auth/callback?state=a%2Fb",
    });
    expect(response).toBeDefined();
    if (response === undefined) throw new Error("Expected Studio response.");
    expect(response.status).toBe(202);
    expect(response.headers.get("x-studio")).toBe("fixture");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.text()).toBe("/studio/auth/callback?state=a%2Fb");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("delegates outside the exact mount and rejects ambiguous owned targets early", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const handler = createTanStackStartStudioHandler(fixture(fetch));
    expect(
      await handler({
        request: new Request("https://app.example.test/outside"),
        rawTarget: "/outside",
      }),
    ).toBeUndefined();
    expect(
      await handler({
        request: new Request("https://app.example.test/studio-other"),
        rawTarget: "/studio-other",
      }),
    ).toBeUndefined();
    const ambiguous = await handler({
      request: new Request("https://app.example.test/studio/auth/login"),
      rawTarget: "/studio%2fauth/login",
    });
    expect(ambiguous?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the host Request cancellation signal", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      async (incoming: Request) =>
        new Promise<Response>((resolve) => {
          incoming.signal.addEventListener(
            "abort",
            () => resolve(new Response(null, { status: 499 })),
            { once: true },
          );
        }),
    );
    const handler = createTanStackStartStudioHandler(fixture(fetch));
    const pending = handler({
      request: new Request("https://app.example.test/studio/api/bootstrap", {
        signal: controller.signal,
      }),
      rawTarget: "/studio/api/bootstrap",
    });
    controller.abort();
    expect((await pending)?.status).toBe(499);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects the wrong external origin before invoking the core", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const handler = createTanStackStartStudioHandler(fixture(fetch));
    const response = await handler({
      request: new Request("https://attacker.example.test/studio"),
      rawTarget: "/studio",
    });
    expect(response?.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
