// Canonicalizes untrusted IPv4/IPv6 source strings into stable network-byte identities for HMAC limiting.

import { isIP } from "node:net";

/** Converts a validated dotted IPv4 address into one canonical byte identity. */
function canonicalIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
  return `4:${Buffer.from(bytes).toString("hex")}`;
}

/** Expands a URL-canonicalized IPv6 host into its exact sixteen network bytes. */
function ipv6Bytes(canonicalHost: string): ReadonlyArray<number> | null {
  const compressed = canonicalHost.split("::");
  if (compressed.length > 2) return null;
  const left = compressed[0] === "" ? [] : (compressed[0]?.split(":") ?? []);
  const right = compressed.length === 1 || compressed[1] === "" ? [] : compressed[1]?.split(":");
  if (right === undefined) return null;
  const missing = 8 - left.length - right.length;
  if ((compressed.length === 1 && missing !== 0) || (compressed.length === 2 && missing < 1)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) {
    return null;
  }
  const bytes: Array<number> = [];
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

/** Maps IPv4-mapped IPv6 addresses to the same four-byte identity as ordinary IPv4 input. */
function canonicalIpv6(value: string): string | null {
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    const canonicalHost = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    const bytes = ipv6Bytes(canonicalHost.toLowerCase());
    if (bytes === null) return null;
    const isMapped =
      bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
    if (isMapped) return `4:${Buffer.from(bytes.slice(12)).toString("hex")}`;
    return `6:${Buffer.from(bytes).toString("hex")}`;
  } catch {
    return null;
  }
}

/** Validates, removes a zone suffix, and canonicalizes equivalent IP spellings without DNS access. */
export function canonicalizeNetworkSource(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 128) return null;
  const zoneIndex = trimmed.indexOf("%");
  const withoutZone = zoneIndex === -1 ? trimmed : trimmed.slice(0, zoneIndex);
  const version = isIP(withoutZone);
  if (version === 4) return canonicalIpv4(withoutZone);
  if (version === 6) return canonicalIpv6(withoutZone);
  return null;
}

/** Chooses Express' trust-proxy-aware IP, then the direct socket, then one shared fail-safe bucket. */
export function selectCanonicalNetworkSource(
  expressIp: string | undefined,
  directSocketAddress: string | undefined,
): string {
  return (
    canonicalizeNetworkSource(expressIp) ??
    canonicalizeNetworkSource(directSocketAddress) ??
    "unknown"
  );
}
