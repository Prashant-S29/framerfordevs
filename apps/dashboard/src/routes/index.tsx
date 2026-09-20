// Redirects the dashboard host root into its authenticated workspace surface.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", search: { status: "active" } });
  },
});
