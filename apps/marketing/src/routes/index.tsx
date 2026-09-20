// Renders the deliberately minimal public product landing page.

import { env } from "@framerfordevs/env/marketing";
import { buttonVariants } from "@framerfordevs/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    links: [{ rel: "canonical", href: new URL("/", env.VITE_MARKETING_ORIGIN).toString() }],
  }),
});

function LandingPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-20">
      <section aria-labelledby="product-heading" className="flex max-w-2xl flex-col gap-6">
        <p className="text-muted-foreground text-sm font-medium">Framer for Devs</p>
        <h1
          id="product-heading"
          className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
        >
          Content operations for developer-owned frontends.
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg leading-8">
          Model, publish, and deliver structured content without giving up your framework,
          repository, or deployment workflow.
        </p>
        <div>
          <a className={buttonVariants({ size: "lg" })} href={env.VITE_DASHBOARD_ORIGIN}>
            Go to dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
