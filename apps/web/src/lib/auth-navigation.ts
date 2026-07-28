import { redirect } from "@tanstack/react-router";

export function getAuthenticatedRedirect<T>(session: T | null) {
  if (session === null) {
    return null;
  }

  return redirect({ to: "/dashboard" });
}
