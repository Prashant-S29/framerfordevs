// Verifies a configured public tunnel hostname, bounded DNS answers, and receiver readiness without printing addresses.

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/** Validates and checks the externally configured named or temporary HTTPS receiver origin. */
async function main(): Promise<void> {
  const raw = process.env.PUBLIC_BASE_URL;
  if (raw === undefined) throw new Error("Set PUBLIC_BASE_URL to the tunnel's HTTPS origin.");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    isIP(url.hostname) !== 0
  ) {
    throw new Error("PUBLIC_BASE_URL must be an HTTPS default-port hostname origin.");
  }
  const answers = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (answers.length < 1 || answers.length > 16)
    throw new Error("Tunnel DNS answers are unavailable or excessive.");
  const response = await fetch(new URL("/health/ready", url), {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("The public tunnel receiver is not ready.");
  process.stdout.write(
    `${JSON.stringify({ ready: true, dnsAnswerCount: answers.length, families: [...new Set(answers.map((answer) => answer.family))].sort() })}\n`,
  );
}

await main();
