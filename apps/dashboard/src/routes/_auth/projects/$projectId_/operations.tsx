// Provides the hosted project operations and security workspace for bounded recovery visibility.

import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Field, FieldLabel } from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, WebhookIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuditFilters } from "@/lib/operations/audit-search";
import {
  auditCategories,
  auditFiltersFromSearch,
  validateAuditSearch,
} from "@/lib/operations/audit-search";
import { orpc } from "@/utils/orpc";

function toIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const Route = createFileRoute("/_auth/projects/$projectId_/operations")({
  validateSearch: validateAuditSearch,
  loader: async ({ context, params }) => {
    const [project, access] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.get.queryOptions({ input: { projectId: params.projectId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.access.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
    ]);
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1_000);
    return { project, access, from: from.toISOString(), to: to.toISOString() };
  },
  component: OperationsWorkspace,
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function OperationsWorkspace() {
  const { projectId } = Route.useParams();
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const filters = useMemo(() => auditFiltersFromSearch(search, initial), [search, initial]);
  const [draft, setDraft] = useState<AuditFilters>(() => filters);
  useEffect(() => {
    setDraft(filters);
  }, [filters]);
  const allowed = new Set(access.data?.data.effectiveProjectActions ?? []);
  const canReadAudit = allowed.has("project.audit.read");
  const canReadWebhooks = allowed.has("webhook.read");
  const from = toIsoDateTime(filters.from);
  const to = toIsoDateTime(filters.to);
  const appliedActorFilterValid =
    (filters.actorKind === "all" && filters.actorId.trim() === "") ||
    (filters.actorKind !== "all" && filters.actorId.trim() !== "");
  const appliedWindowValid =
    from !== null &&
    to !== null &&
    Date.parse(to) >= Date.parse(from) &&
    Date.parse(to) - Date.parse(from) <= 31 * 24 * 60 * 60 * 1_000;
  const draftFrom = toIsoDateTime(draft.from);
  const draftTo = toIsoDateTime(draft.to);
  const actorFilterValid =
    (draft.actorKind === "all" && draft.actorId.trim() === "") ||
    (draft.actorKind !== "all" && draft.actorId.trim() !== "");
  const windowValid =
    draftFrom !== null &&
    draftTo !== null &&
    Date.parse(draftTo) >= Date.parse(draftFrom) &&
    Date.parse(draftTo) - Date.parse(draftFrom) <= 31 * 24 * 60 * 60 * 1_000;
  const audit = useInfiniteQuery({
    ...orpc.platform.projects.operations.audit.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        query: {
          environmentId: filters.environmentId === "" ? null : filters.environmentId,
          category: filters.category,
          actorKind: filters.actorKind,
          actorId: filters.actorKind === "all" ? null : filters.actorId.trim(),
          action: filters.action.trim() === "" ? null : filters.action.trim(),
          from: from ?? initial.from,
          to: to ?? initial.to,
          cursor,
          limit: 25,
        },
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
    enabled: canReadAudit && appliedActorFilterValid && appliedWindowValid,
  });
  const events = audit.data?.pages.flatMap((page) => page.data.items) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="space-y-4">
        <Button variant="ghost" render={<Link to="/projects/$projectId" params={{ projectId }} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to project
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations &amp; security</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Inspect bounded, content-free audit history and open operational recovery controls for{" "}
            {project.data?.data.name ?? "this project"}.
          </p>
        </div>
      </header>

      {canReadWebhooks ? (
        <Card>
          <CardHeader>
            <CardTitle>Webhook operations</CardTitle>
            <CardDescription>
              Inspect endpoints, invalidation mappings, delivery attempts, and dead-letter recovery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/projects/$projectId/webhooks" params={{ projectId }} />}>
              <WebhookIcon data-icon="inline-start" />
              Open webhook operations
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="audit-heading" className="space-y-4">
        <div>
          <h2 id="audit-heading" className="text-lg font-semibold">
            Project audit history
          </h2>
          <p className="text-muted-foreground text-sm">
            Results exclude content bodies and secrets. Windows are limited to 31 days and every
            successful read is itself audited.
          </p>
        </div>
        {!canReadAudit ? (
          <p className="border p-4 text-sm">
            You do not have permission to read project audit history.
          </p>
        ) : (
          <>
            <form
              className="grid gap-3 rounded-md border p-4 md:grid-cols-2 xl:grid-cols-4"
              aria-label="Filter project audit history"
              onSubmit={(event) => {
                event.preventDefault();
                const draftFrom = toIsoDateTime(draft.from);
                const draftTo = toIsoDateTime(draft.to);
                if (draftFrom === null || draftTo === null) return;
                void navigate({
                  search: {
                    ...(draft.environmentId === "" ? {} : { environment: draft.environmentId }),
                    ...(draft.category === "all" ? {} : { category: draft.category }),
                    ...(draft.actorKind === "all"
                      ? {}
                      : { actor: draft.actorKind, actorId: draft.actorId.trim() }),
                    ...(draft.action.trim() === "" ? {} : { action: draft.action.trim() }),
                    from: draftFrom,
                    to: draftTo,
                  },
                  replace: false,
                });
              }}
            >
              <Field>
                <FieldLabel htmlFor="audit-from">From</FieldLabel>
                <Input
                  id="audit-from"
                  type="datetime-local"
                  step={0.001}
                  value={draft.from}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, from: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="audit-to">To</FieldLabel>
                <Input
                  id="audit-to"
                  type="datetime-local"
                  step={0.001}
                  value={draft.to}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, to: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="audit-environment">Environment</FieldLabel>
                <NativeSelect
                  id="audit-environment"
                  value={draft.environmentId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      environmentId: event.target.value,
                    }))
                  }
                >
                  <NativeSelectOption value="">All project environments</NativeSelectOption>
                  {project.data ? (
                    <NativeSelectOption value={project.data.data.environment.id}>
                      {project.data.data.environment.name}
                    </NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="audit-category">Category</FieldLabel>
                <NativeSelect
                  id="audit-category"
                  value={draft.category}
                  onChange={(event) => {
                    const category = auditCategories.find((value) => value === event.target.value);
                    if (category) setDraft((current) => ({ ...current, category }));
                  }}
                >
                  {auditCategories.map((category) => (
                    <NativeSelectOption key={category} value={category}>
                      {category}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="audit-action">Exact action</FieldLabel>
                <Input
                  id="audit-action"
                  maxLength={128}
                  value={draft.action}
                  placeholder="project.credential.rotation_activated"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, action: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="audit-actor-kind">Actor kind</FieldLabel>
                <NativeSelect
                  id="audit-actor-kind"
                  value={draft.actorKind}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "all" || value === "user" || value === "credential") {
                      setDraft((current) => ({
                        ...current,
                        actorKind: value,
                        actorId: value === "all" ? "" : current.actorId,
                      }));
                    }
                  }}
                >
                  <NativeSelectOption value="all">All actors</NativeSelectOption>
                  <NativeSelectOption value="user">User</NativeSelectOption>
                  <NativeSelectOption value="credential">Credential</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field data-disabled={draft.actorKind === "all"}>
                <FieldLabel htmlFor="audit-actor-id">Exact actor ID</FieldLabel>
                <Input
                  id="audit-actor-id"
                  disabled={draft.actorKind === "all"}
                  maxLength={255}
                  value={draft.actorId}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, actorId: event.target.value }))
                  }
                />
              </Field>
              <div className="flex items-end md:col-span-2">
                <Button type="submit" disabled={!windowValid || !actorFilterValid}>
                  Apply filters
                </Button>
              </div>
              {!windowValid ? (
                <p className="text-destructive text-sm md:col-span-2 xl:col-span-4">
                  Choose an ordered window no longer than 31 days.
                </p>
              ) : null}
              {!actorFilterValid ? (
                <p className="text-destructive text-sm md:col-span-2 xl:col-span-4">
                  Exact actor filters require both actor kind and actor ID.
                </p>
              ) : null}
            </form>

            {audit.isPending ? (
              <p className="flex items-center gap-2 text-sm" role="status">
                <Spinner /> Loading audit history…
              </p>
            ) : null}
            {audit.isError ? (
              <div
                className="flex items-center gap-3 border border-destructive/40 p-4"
                role="alert"
              >
                <p className="text-sm">Audit history could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => void audit.refetch()}>
                  Try again
                </Button>
              </div>
            ) : null}
            {events.length > 0 ? (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="rounded-md border p-4 text-sm">
                    <div>
                      <p className="font-medium">{event.action}</p>
                      <p className="text-muted-foreground font-mono text-xs" translate="no">
                        {event.resourceType} · {event.resourceId}
                      </p>
                    </div>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Occurred</dt>
                        <dd>{dateFormatter.format(new Date(event.occurredAt))}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Actor</dt>
                        <dd className="break-all font-mono text-xs" translate="no">
                          {event.actor.kind}:{event.actor.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Request</dt>
                        <dd className="break-all font-mono text-xs" translate="no">
                          {event.requestId}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ol>
            ) : null}
            {!audit.isPending && !audit.isError && events.length === 0 ? (
              <p className="text-muted-foreground border p-4 text-sm">
                No audit events match this bounded window.
              </p>
            ) : null}
            {audit.hasNextPage ? (
              <Button
                variant="outline"
                className="mx-auto flex"
                disabled={audit.isFetchingNextPage}
                onClick={() => void audit.fetchNextPage()}
              >
                {audit.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
                {audit.isFetchingNextPage ? "Loading…" : "Load more audit events"}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
