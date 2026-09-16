const defaultBaseUrl = "http://localhost:3001";
const allowedHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

export function browserTestBaseUrl() {
  const rawBaseUrl = process.env.FFD_BROWSER_TEST_BASE_URL ?? defaultBaseUrl;
  const invalidBaseUrl =
    "FFD_BROWSER_TEST_BASE_URL must be a bounded HTTP(S) loopback origin without credentials, path, query, or fragment.";

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

export default async function preflight() {
  const loginUrl = new URL("/login", browserTestBaseUrl());
  let response: Response;

  try {
    response = await fetch(loginUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error(
      `Browser test application is unavailable at ${loginUrl.origin}. Start the local Docker stack before running browser tests.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Browser test application preflight returned HTTP ${response.status} at ${loginUrl.origin}.`,
    );
  }
}
