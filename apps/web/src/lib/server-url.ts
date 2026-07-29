function withoutTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function processEnvironment() {
  return (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

export function getServerUrl(publicUrl: string) {
  const normalizedPublicUrl = withoutTrailingSlash(publicUrl);

  if (typeof window === "undefined") {
    const environment = processEnvironment();
    const internalServerUrl = environment?.INTERNAL_SERVER_URL;
    if (internalServerUrl) {
      return withoutTrailingSlash(internalServerUrl);
    }

    if (normalizedPublicUrl.startsWith("/")) {
      const vercelUrl =
        environment?.VERCEL_ENV === "production"
          ? (environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL)
          : (environment?.VERCEL_URL ?? environment?.VERCEL_PROJECT_PRODUCTION_URL);
      if (vercelUrl) {
        const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
        return `${withoutTrailingSlash(origin)}${normalizedPublicUrl}`;
      }

      return `http://localhost:3000${normalizedPublicUrl}`;
    }
  }

  if (!normalizedPublicUrl.startsWith("/")) {
    return normalizedPublicUrl;
  }

  return `${window.location.origin}${normalizedPublicUrl}`;
}
