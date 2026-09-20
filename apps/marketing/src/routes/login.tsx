// Implements the marketing host's validated, no-credential dashboard login redirect entry.

import { env } from "@framerfordevs/env/marketing";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { buildDashboardLoginUrl, parseLoginEntrySearch } from "@/lib/auth-entry";

const invalidLoginHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Page not found | Framer for Devs</title>
  </head>
  <body>
    <main>
      <h1>Page not found</h1>
      <p>The requested login destination is not available.</p>
      <a href="/">Return home</a>
    </main>
  </body>
</html>`;

const authEntryHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function parseRequestSearch(request: Request) {
  const values: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    const previous = values[key];
    values[key] =
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value];
  }
  return parseLoginEntrySearch(values);
}

export const Route = createFileRoute("/login")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const destination = buildDashboardLoginUrl(
          env.VITE_DASHBOARD_ORIGIN,
          parseRequestSearch(request),
        );
        if (destination === null)
          return new Response(invalidLoginHtml, {
            status: 404,
            headers: { ...authEntryHeaders, "Content-Type": "text/html; charset=utf-8" },
          });
        return new Response(null, {
          status: 307,
          headers: { ...authEntryHeaders, Location: destination.toString() },
        });
      },
    },
  },
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ search }) => {
    const destination = buildDashboardLoginUrl(
      env.VITE_DASHBOARD_ORIGIN,
      parseLoginEntrySearch(search),
    );
    if (destination === null) throw notFound({ headers: authEntryHeaders });
    throw redirect({ href: destination.toString(), headers: authEntryHeaders });
  },
});
