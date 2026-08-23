// Provides an accessible public-only fallback for unknown developer-documentation routes.

import { Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-mono text-sm text-fd-muted-foreground">404</p>
        <h1 className="text-4xl font-semibold text-balance">Documentation Page Not Found</h1>
        <p className="max-w-lg text-pretty text-fd-muted-foreground">
          The requested public documentation page does not exist. Start from the documentation
          overview or search for the workflow you need.
        </p>
        <Link
          to="/docs/$"
          params={{ _splat: "" }}
          className="mt-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Open Documentation
        </Link>
      </main>
    </HomeLayout>
  );
}
