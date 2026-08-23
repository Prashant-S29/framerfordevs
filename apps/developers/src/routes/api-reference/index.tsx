// Introduces the secondary wire-contract area and routes developers to independently versioned families.

import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/api-reference/")({
  component: ApiReferenceOverview,
});

const families = [
  {
    description: "Published, explicit-locale content reads and immutable publications.",
    family: "delivery/v1",
    title: "Delivery v1",
  },
  {
    description: "Trusted server-side access to current and historical drafts.",
    family: "preview/v1",
    title: "Preview v1",
  },
  {
    description: "CLI project discovery and immutable published-schema retrieval.",
    family: "tooling/v1",
    title: "Tooling v1",
  },
  {
    description: "Publication-event envelopes, data variants, and signature protocol.",
    family: "webhooks/v1",
    title: "Webhook data v1",
  },
] as const;

function ApiReferenceOverview() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20 sm:px-10">
        <p className="font-mono text-sm text-fd-primary">Secondary Reference</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance">API Contracts</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-pretty text-fd-muted-foreground">
          Inspect exact operations, parameters, responses, errors, and schemas after learning the
          product workflow. Each family evolves independently and is generated from immutable public
          contract authority.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {families.map((family) => (
            <Link
              key={family.family}
              to="/api-reference/$"
              params={{ _splat: family.family }}
              className="rounded-xl border p-6 hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <h2 className="text-xl font-semibold">{family.title}</h2>
              <p className="mt-2 text-sm leading-6 text-pretty text-fd-muted-foreground">
                {family.description}
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-sm text-fd-muted-foreground">
          Looking for setup instructions?{" "}
          <Link to="/docs/$" params={{ _splat: "get-started" }}>
            Start with the developer guide.
          </Link>
        </p>
      </main>
    </HomeLayout>
  );
}
