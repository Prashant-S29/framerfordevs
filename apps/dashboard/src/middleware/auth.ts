import { env } from "@framerfordevs/env/dashboard";
import { createMiddleware } from "@tanstack/react-start";

import { authClient } from "@/lib/auth/client";

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const headers = new Headers();
  for (const name of ["cookie", "traceparent", "user-agent", "x-request-id"] as const) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("X-Forwarded-Host", new URL(env.VITE_DASHBOARD_ORIGIN).host);

  const session = await authClient.getSession({
    fetchOptions: {
      headers,
      throw: true,
    },
  });
  return next({
    context: { session },
  });
});
