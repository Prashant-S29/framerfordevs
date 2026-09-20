const allowedHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function loopbackOrigin(environmentName: string, fallback: string) {
  const rawBaseUrl = process.env[environmentName] ?? fallback;
  const invalidBaseUrl = `${environmentName} must be a bounded HTTP(S) loopback origin without credentials, path, query, or fragment.`;

  if (rawBaseUrl.length === 0 || rawBaseUrl.length > 2_048) throw new Error(invalidBaseUrl);

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(invalidBaseUrl);
  }

  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    !allowedHostnames.has(baseUrl.hostname) ||
    baseUrl.username !== "" ||
    baseUrl.password !== "" ||
    baseUrl.pathname !== "/" ||
    baseUrl.search !== "" ||
    baseUrl.hash !== ""
  ) {
    throw new Error(invalidBaseUrl);
  }

  return baseUrl;
}

export function browserTestBaseUrl() {
  return loopbackOrigin("FFD_BROWSER_TEST_BASE_URL", "http://localhost:3001");
}

export function browserTestOrigins() {
  return {
    dashboard: browserTestBaseUrl(),
    developers: loopbackOrigin("FFD_BROWSER_TEST_DEVELOPERS_ORIGIN", "http://127.0.0.1:3002"),
    marketing: loopbackOrigin("FFD_BROWSER_TEST_MARKETING_ORIGIN", "http://127.0.0.1:3003"),
  } as const;
}

export default async function preflight() {
  const origins = browserTestOrigins();
  const probes = [
    new URL("/login", origins.dashboard),
    new URL("/docs", origins.developers),
    new URL("/", origins.marketing),
  ];

  for (const probe of probes) {
    let response: Response;
    try {
      response = await fetch(probe, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new Error(
        `Browser test application is unavailable at ${probe.origin}. Start the local Docker stack before running browser tests.`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Browser test application preflight returned HTTP ${response.status} at ${probe.origin}.`,
      );
    }
  }
}
