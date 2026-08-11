// Verifies stable, dependency-light source identities for trusted-proxy rate-limit boundaries.

import { describe, expect, it } from "vitest";

import { canonicalizeNetworkSource, selectCanonicalNetworkSource } from "./network-source";

describe("network source canonicalization", () => {
  it("canonicalizes IPv4 and IPv4-mapped IPv6 to one identity", () => {
    expect(canonicalizeNetworkSource("192.0.2.128")).toBe("4:c0000280");
    expect(canonicalizeNetworkSource("::ffff:192.0.2.128")).toBe("4:c0000280");
    expect(canonicalizeNetworkSource("::ffff:c000:0280")).toBe("4:c0000280");
  });

  it("canonicalizes equivalent compressed and expanded IPv6 forms", () => {
    const compressed = canonicalizeNetworkSource("2001:db8::1");
    const expanded = canonicalizeNetworkSource("2001:0db8:0000:0000:0000:0000:0000:0001");

    expect(compressed).toBe("6:20010db8000000000000000000000001");
    expect(expanded).toBe(compressed);
  });

  it("removes an IPv6 zone suffix after bounding input", () => {
    expect(canonicalizeNetworkSource("fe80::1%eth0")).toBe("6:fe800000000000000000000000000001");
  });

  it("falls back to the direct socket and then one shared unknown bucket", () => {
    expect(selectCanonicalNetworkSource("forged", "203.0.113.8")).toBe("4:cb007108");
    expect(selectCanonicalNetworkSource(undefined, undefined)).toBe("unknown");
    expect(selectCanonicalNetworkSource("x".repeat(129), "also-invalid")).toBe("unknown");
  });
});
