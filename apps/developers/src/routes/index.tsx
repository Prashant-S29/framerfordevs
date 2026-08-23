// Presents the developer-first landing page and directs newcomers into task-oriented documentation.

import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { ArrowRight, BookOpen, Braces, TerminalSquare, Webhook } from "lucide-react";

import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

const paths = [
  {
    description: "Create a project, publish content, and read it from your application.",
    icon: BookOpen,
    label: "Start Building",
    slug: "get-started",
  },
  {
    description: "Install the framework-independent client and fetch explicit-locale content.",
    icon: Braces,
    label: "Use the SDK",
    slug: "sdk",
  },
  {
    description: "Link a project, pull published schemas, and generate deterministic types.",
    icon: TerminalSquare,
    label: "Set Up the CLI",
    slug: "cli",
  },
  {
    description: "Verify publication events and invalidate only the content that changed.",
    icon: Webhook,
    label: "Handle Webhooks",
    slug: "webhooks",
  },
] as const;

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-20 sm:px-10 lg:py-28">
        <section className="max-w-4xl">
          <p className="mb-5 font-mono text-sm font-medium text-fd-primary">
            Developer Documentation
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
            Model once. Publish safely. Render anywhere.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-pretty text-fd-muted-foreground">
            Learn how Framer for Devs turns versioned content models into localized publications,
            typed clients, preview workflows, and reliable update events—without taking ownership of
            your frontend runtime.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/docs/$"
              params={{ _splat: "get-started" }}
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Start Building
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Explore Documentation
            </Link>
          </div>
        </section>

        <section aria-labelledby="choose-path" className="mt-24">
          <h2 id="choose-path" className="text-2xl font-semibold tracking-tight text-balance">
            Choose Your Path
          </h2>
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl border bg-fd-border md:grid-cols-2">
            {paths.map((path) => {
              const Icon = path.icon;
              return (
                <Link
                  key={path.slug}
                  to="/docs/$"
                  params={{ _splat: path.slug }}
                  className="group min-w-0 bg-fd-background p-6 hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-[-3px]"
                >
                  <Icon aria-hidden="true" className="size-5 text-fd-primary" />
                  <h3 className="mt-8 text-lg font-semibold">{path.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-pretty text-fd-muted-foreground">
                    {path.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium">
                    Open Guide
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}
