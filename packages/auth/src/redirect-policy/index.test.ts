import { describe, expect, it } from "vitest";

import { allowsLocalLoopbackRedirect } from "./index";

const callback = (origin: string) => new URL(`${origin}/studio/auth/callback`);

describe("local loopback redirect policy", () => {
  it("allows exact loopback HTTP hosts outside production", () => {
    for (const nodeEnv of ["development", "test"] as const) {
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://localhost:4000"))).toBe(true);
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://127.0.0.1:43127"))).toBe(true);
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://[::1]:4000"))).toBe(true);
    }
  });

  it("rejects every HTTP redirect in production", () => {
    expect(allowsLocalLoopbackRedirect("production", callback("http://localhost:4000"))).toBe(
      false,
    );
    expect(allowsLocalLoopbackRedirect("production", callback("http://127.0.0.1:43127"))).toBe(
      false,
    );
  });

  it("rejects non-loopback and look-alike hosts in every environment", () => {
    for (const nodeEnv of ["development", "test", "production"] as const) {
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://studio.example.test"))).toBe(
        false,
      );
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://localhost.evil.test"))).toBe(
        false,
      );
      expect(allowsLocalLoopbackRedirect(nodeEnv, callback("http://127.0.0.2"))).toBe(false);
    }
  });
});
