// Presents webhook event variants and the complete canonical JSON Schema without duplicating payload definitions.

import webhookSchema from "@framerfordevs/public-contracts/artifacts/webhooks/v1/events.schema.json";
import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/api-reference/webhooks/v1")({
  component: WebhookReference,
});

const schemaText = JSON.stringify(webhookSchema, null, 2);
const eventTypes = findEventTypes(webhookSchema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findEventTypes(value: unknown): ReadonlyArray<string> {
  if (!isRecord(value) || !isRecord(value.$defs)) return [];

  const found = new Set<string>();
  for (const definition of Object.values(value.$defs)) {
    if (!isRecord(definition) || !isRecord(definition.properties)) continue;
    const typeProperty = definition.properties.type;
    if (!isRecord(typeProperty) || !Array.isArray(typeProperty.enum)) continue;

    for (const candidate of typeProperty.enum) {
      if (typeof candidate === "string" && candidate.startsWith("cms.")) found.add(candidate);
    }
  }

  return [...found].toSorted();
}

function WebhookReference() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 sm:px-10">
        <p className="font-mono text-sm text-fd-primary">Canonical JSON Schema</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">Webhook Data v1</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-pretty text-fd-muted-foreground">
          This reference reads the same generated JSON Schema emitted under the public contract
          registry. The webhook guide remains the authority for verification, retries, replay
          reservation, and invalidation workflows.
        </p>

        <section className="mt-12" aria-labelledby="event-types">
          <h2 id="event-types" className="text-2xl font-semibold">
            Event Types
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {eventTypes.map((eventType) => (
              <li key={eventType} className="rounded-lg border bg-fd-card p-4 font-mono text-sm">
                {eventType}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="schema-document">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="schema-document" className="text-2xl font-semibold">
              Complete Schema
            </h2>
            <a
              href="/specs/webhooks/v1/events.schema.json"
              download
              className="text-sm font-medium underline underline-offset-4"
            >
              Download JSON Schema
            </a>
          </div>
          <details className="mt-5 rounded-xl border">
            <summary className="cursor-pointer px-5 py-4 font-medium">
              Inspect canonical JSON
            </summary>
            <pre className="max-h-[48rem] overflow-auto border-t p-5 text-xs" tabIndex={0}>
              <code>{schemaText}</code>
            </pre>
          </details>
        </section>
      </main>
    </HomeLayout>
  );
}
