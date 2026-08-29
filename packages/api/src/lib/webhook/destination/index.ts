// Applies pure webhook URL, hostname, and all-answer IP policy before any outbound connection.

import { domainToASCII } from "node:url";

import ipaddr from "ipaddr.js";

export type WebhookDestinationRejectionCategory =
  | "invalid_url"
  | "scheme"
  | "port"
  | "userinfo"
  | "fragment"
  | "hostname"
  | "literal_ip"
  | "blocked_hostname"
  | "dns_empty"
  | "dns_too_many_answers"
  | "dns_invalid_answer"
  | "dns_non_public_answer";

export interface NormalizedWebhookDestination {
  readonly url: string;
  readonly hostname: string;
  readonly displayOrigin: string;
}

export type WebhookDestinationPolicyResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly category: WebhookDestinationRejectionCategory };

const blockedExactHostnames = new Set(["localhost", "localhost.localdomain"]);
const blockedHostnameSuffixes = [".localhost", ".local", ".internal", ".home", ".lan"];
const maximumDnsAnswers = 16;

function rejected<A>(
  category: WebhookDestinationRejectionCategory,
): WebhookDestinationPolicyResult<A> {
  return { ok: false, category };
}

function normalizedHostname(hostname: string): string | null {
  const withoutTrailingDot = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const ascii = domainToASCII(withoutTrailingDot).toLowerCase();
  if (
    ascii.length < 1 ||
    ascii.length > 253 ||
    !ascii.includes(".") ||
    ascii.split(".").some((label) => label.length < 1 || label.length > 63)
  ) {
    return null;
  }
  return ascii;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    blockedExactHostnames.has(hostname) ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  );
}

/** Normalizes a destination without DNS or HTTP and rejects authority-smuggling syntax. */
export function normalizeWebhookDestination(
  input: string,
): WebhookDestinationPolicyResult<NormalizedWebhookDestination> {
  if (Buffer.byteLength(input, "utf8") > 2_048) return rejected("invalid_url");
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return rejected("invalid_url");
  }
  if (parsed.protocol !== "https:") return rejected("scheme");
  if (parsed.port !== "") return rejected("port");
  if (parsed.username !== "" || parsed.password !== "") return rejected("userinfo");
  if (parsed.hash !== "") return rejected("fragment");
  if (ipaddr.isValid(parsed.hostname.replace(/^\[|\]$/gu, ""))) return rejected("literal_ip");
  const hostname = normalizedHostname(parsed.hostname);
  if (hostname === null) return rejected("hostname");
  if (isBlockedHostname(hostname)) return rejected("blocked_hostname");
  parsed.hostname = hostname;
  return {
    ok: true,
    value: {
      url: parsed.toString(),
      hostname,
      displayOrigin: `https://${hostname}`,
    },
  };
}

function isPublicAddress(input: string): boolean {
  try {
    const address = ipaddr.process(input);
    return address.range() === "unicast";
  } catch {
    return false;
  }
}

/** Requires every bounded DNS answer to be a globally routable unicast address. */
export function validateWebhookDnsAnswers(
  answers: ReadonlyArray<string>,
): WebhookDestinationPolicyResult<ReadonlyArray<string>> {
  if (answers.length === 0) return rejected("dns_empty");
  if (answers.length > maximumDnsAnswers) return rejected("dns_too_many_answers");
  const canonical: Array<string> = [];
  for (const answer of answers) {
    if (!ipaddr.isValid(answer)) return rejected("dns_invalid_answer");
    const address = ipaddr.process(answer);
    if (!isPublicAddress(answer)) return rejected("dns_non_public_answer");
    canonical.push(address.toNormalizedString());
  }
  return { ok: true, value: [...new Set(canonical)].sort() };
}
