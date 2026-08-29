// Provides the protected non-nested M11 webhook operations workspace.

import type {
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookPublicEventType,
} from "@framerfordevs/api/contracts/webhook/index";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@framerfordevs/ui/components/alert-dialog";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Field, FieldLabel } from "@framerfordevs/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CreateInvalidationMappingDialog,
  CreateWebhookEndpointDialog,
  EditInvalidationMappingDialog,
  WebhookEndpointActions,
} from "@/components/webhook-controls";
import { orpc } from "@/utils/orpc";

const eventTypes = [
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
] as const satisfies ReadonlyArray<WebhookPublicEventType>;
const deliveryStatuses = [
  "queued",
  "delivering",
  "retry_scheduled",
  "succeeded",
  "dead_letter",
  "canceled",
] as const satisfies ReadonlyArray<WebhookDeliveryStatus>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface WebhookSearch {
  readonly endpoint?: string;
  readonly event?: WebhookPublicEventType;
  readonly status?: WebhookDeliveryStatus;
}

function validateWebhookSearch(search: Record<string, unknown>): WebhookSearch {
  return {
    ...(typeof search.endpoint === "string" && uuidPattern.test(search.endpoint)
      ? { endpoint: search.endpoint }
      : {}),
    ...(eventTypes.some((value) => value === search.event)
      ? { event: search.event as WebhookPublicEventType }
      : {}),
    ...(deliveryStatuses.some((value) => value === search.status)
      ? { status: search.status as WebhookDeliveryStatus }
      : {}),
  };
}

export const Route = createFileRoute("/_auth/projects/$projectId_/webhooks")({
  validateSearch: validateWebhookSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    const [project] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.get.queryOptions({ input: { projectId: params.projectId } }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.access.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
    ]);
    const scope = { projectId: params.projectId, environmentId: project.data.environment.id };
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.webhooks.endpoints.list.queryOptions({
          input: { ...scope, cursor: null, limit: 25 },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.webhooks.mappings.list.queryOptions({
          input: { ...scope, cursor: null, limit: 25 },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.webhooks.deliveries.list.queryOptions({
          input: {
            ...scope,
            endpointId: deps.endpoint ?? null,
            eventType: deps.event ?? null,
            status: deps.status ?? null,
            cursor: null,
            limit: 25,
          },
        }),
      ),
    ]);
  },
  component: WebhookWorkspace,
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  return value === null ? "Not scheduled" : dateFormatter.format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function LoadMoreButton({
  label,
  loading,
  onClick,
}: {
  readonly label: string;
  readonly loading: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button variant="outline" className="self-center" disabled={loading} onClick={onClick}>
      {loading ? "Loading…" : label}
    </Button>
  );
}

function DeliveryAttempts({
  projectId,
  environmentId,
  delivery,
  onClose,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly delivery: WebhookDelivery;
  readonly onClose: () => void;
}) {
  const attempts = useInfiniteQuery(
    orpc.webhooks.attempts.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        environmentId,
        deliveryId: delivery.id,
        cursor,
        limit: 5,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 4,
    }),
  );
  const items = attempts.data?.pages.flatMap((page) => page.data.items) ?? [];
  return (
    <Card aria-labelledby="delivery-detail-heading">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle id="delivery-detail-heading">Delivery detail</CardTitle>
            <CardDescription>
              Content-free canonical event metadata and immutable attempts. Response bodies and
              headers are never stored.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Canonical event JSON</h3>
          <pre
            className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap break-all"
            translate="no"
          >
            {JSON.stringify(delivery.event, null, 2)}
          </pre>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Attempt timeline</h3>
          {attempts.isPending ? (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Spinner /> Loading attempts…
            </p>
          ) : null}
          {items.length > 0 ? (
            <ol className="space-y-3">
              {items.map((attempt) => (
                <li key={attempt.id} className="border-l pl-3 text-sm">
                  <span className="font-medium">
                    Attempt {attempt.attemptNumber}: {formatStatus(attempt.state)}
                  </span>
                  <p className="text-muted-foreground">
                    Started {formatDate(attempt.startedAt)} ·{" "}
                    {attempt.httpStatus ?? "No HTTP response"}
                    {attempt.durationMs === null ? "" : ` · ${attempt.durationMs} ms`}
                    {attempt.outcome === null ? "" : ` · ${formatStatus(attempt.outcome)}`}
                  </p>
                  {attempt.nextAttemptAt === null ? null : (
                    <p className="text-muted-foreground">
                      Next retry {formatDate(attempt.nextAttemptAt)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : null}
          {!attempts.isPending && items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No attempts recorded.</p>
          ) : null}
          {attempts.hasNextPage ? (
            <LoadMoreButton
              label="Load more attempts"
              loading={attempts.isFetchingNextPage}
              onClick={() => void attempts.fetchNextPage()}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ReplayDeliveryDialog({
  projectId,
  environmentId,
  delivery,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly delivery: WebhookDelivery;
}) {
  const queryClient = useQueryClient();
  const replay = useMutation(
    orpc.webhooks.deliveries.replay.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.deliveries.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.endpoints.list.key() });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>Replay event</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replay this dead-letter event?</AlertDialogTitle>
          <AlertDialogDescription>
            Replay creates a new at-least-once delivery but preserves event ID {delivery.eventId}{" "}
            and the original immutable event body. Consumers must use that event ID for idempotency.
            The current enabled endpoint destination and signing secret will be used.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={replay.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={replay.isPending}
            onClick={() =>
              replay.mutate({
                projectId,
                environmentId,
                endpointId: delivery.endpointId,
                eventId: delivery.eventId,
                sourceDeliveryId: delivery.id,
                commandId: crypto.randomUUID(),
              })
            }
          >
            {replay.isPending ? <Spinner data-icon="inline-start" /> : null}
            {replay.isPending ? "Queueing…" : "Confirm replay"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WebhookWorkspace() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const queryClient = useQueryClient();
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const environmentId = project.data?.data.environment.id ?? "";
  const scope = { projectId, environmentId };
  const endpoints = useInfiniteQuery({
    ...orpc.webhooks.endpoints.list.infiniteOptions({
      input: (cursor: string | null) => ({ ...scope, cursor, limit: 25 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 4,
    }),
    enabled: environmentId.length > 0,
  });
  const mappings = useInfiniteQuery({
    ...orpc.webhooks.mappings.list.infiniteOptions({
      input: (cursor: string | null) => ({ ...scope, cursor, limit: 25 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 5,
    }),
    enabled: environmentId.length > 0,
  });
  const deliveries = useInfiniteQuery({
    ...orpc.webhooks.deliveries.list.infiniteOptions({
      input: (cursor: string | null) => ({
        ...scope,
        endpointId: search.endpoint ?? null,
        eventType: search.event ?? null,
        status: search.status ?? null,
        cursor,
        limit: 25,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
    enabled: environmentId.length > 0,
  });
  const mappingState = useMutation(
    orpc.webhooks.mappings.setState.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.mappings.list.key() });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const endpointItems = endpoints.data?.pages.flatMap((page) => page.data.items) ?? [];
  const mappingItems = mappings.data?.pages.flatMap((page) => page.data.items) ?? [];
  const deliveryItems = deliveries.data?.pages.flatMap((page) => page.data.items) ?? [];
  const selectedDelivery = deliveryItems.find((delivery) => delivery.id === selectedDeliveryId);
  const canManage = access.data?.data.allowedActions.includes("webhook.manage") === true;

  function updateSearch(patch: Partial<WebhookSearch>) {
    void navigate({
      search: {
        ...search,
        ...patch,
      },
      replace: true,
    });
    setSelectedDeliveryId(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="space-y-4">
        <Button variant="ghost" render={<Link to="/projects/$projectId" params={{ projectId }} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to project
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Manage publication notifications, exact invalidation hints, delivery attempts, and dead
            letters. Destinations and secrets remain encrypted and masked.
          </p>
        </div>
      </header>

      <section aria-labelledby="webhook-endpoints-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="webhook-endpoints-heading" className="text-lg font-semibold">
            Endpoints
          </h2>
          {canManage ? (
            <CreateWebhookEndpointDialog projectId={projectId} environmentId={environmentId} />
          ) : null}
        </div>
        {endpoints.isPending ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Spinner /> Loading endpoints…
          </p>
        ) : null}
        {endpointItems.length > 0 ? (
          <div className="grid gap-3">
            {endpointItems.map((endpoint) => (
              <Card key={endpoint.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{endpoint.name}</CardTitle>
                      <CardDescription className="break-all">
                        {endpoint.destinationOrigin}/••••
                      </CardDescription>
                    </div>
                    <Badge variant={endpoint.state === "enabled" ? "default" : "secondary"}>
                      {endpoint.state}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Signing state</dt>
                      <dd>
                        {endpoint.rotationState === null
                          ? "Unavailable"
                          : formatStatus(endpoint.rotationState)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Overlap ends</dt>
                      <dd>{formatDate(endpoint.rotationEndsAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last outcome</dt>
                      <dd>
                        {endpoint.lastOutcome === null
                          ? "No outcome yet"
                          : formatStatus(endpoint.lastOutcome)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Dead letters</dt>
                      <dd>{endpoint.deadLetterCount}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2" aria-label="Event subscriptions">
                    {endpoint.subscriptions.map((type) => (
                      <Badge key={type} variant="outline">
                        {type}
                      </Badge>
                    ))}
                  </div>
                  {canManage ? (
                    <WebhookEndpointActions
                      projectId={projectId}
                      environmentId={environmentId}
                      endpoint={endpoint}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
        {!endpoints.isPending && endpointItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">No webhook endpoints configured.</p>
        ) : null}
        {endpoints.hasNextPage ? (
          <LoadMoreButton
            label="Load more endpoints"
            loading={endpoints.isFetchingNextPage}
            onClick={() => void endpoints.fetchNextPage()}
          />
        ) : null}
      </section>

      <section aria-labelledby="invalidation-mappings-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="invalidation-mappings-heading" className="text-lg font-semibold">
            Invalidation mappings
          </h2>
          {canManage ? (
            <CreateInvalidationMappingDialog projectId={projectId} environmentId={environmentId} />
          ) : null}
        </div>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Collection mappings match every entry and locale unless narrowed to an exact stable entry
          or locale ID. They snapshot provider-neutral metadata and never contact a framework cache.
        </p>
        {mappings.isPending ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Spinner /> Loading mappings…
          </p>
        ) : null}
        {mappingItems.length > 0 ? (
          <div className="grid gap-3">
            {mappingItems.map((mapping) => (
              <Card key={mapping.id}>
                <CardContent className="space-y-3 pt-6 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{mapping.name}</p>
                      <code className="text-muted-foreground break-all" translate="no">
                        {mapping.route}
                      </code>
                    </div>
                    <Badge variant={mapping.state === "enabled" ? "default" : "secondary"}>
                      {mapping.state}
                    </Badge>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Collection</dt>
                      <dd className="font-mono break-all" translate="no">
                        {mapping.collectionId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Entry scope</dt>
                      <dd className="font-mono break-all" translate="no">
                        {mapping.entryId ?? "All entries"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Locale scope</dt>
                      <dd className="font-mono break-all" translate="no">
                        {mapping.localeId ?? "All locales"}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {mapping.eventTypes.map((type) => (
                      <Badge key={type} variant="outline">
                        {type}
                      </Badge>
                    ))}
                    {mapping.semanticTags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <EditInvalidationMappingDialog
                        key={mapping.version}
                        projectId={projectId}
                        environmentId={environmentId}
                        mapping={mapping}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mappingState.isPending}
                        onClick={() =>
                          mappingState.mutate({
                            projectId,
                            environmentId,
                            mappingId: mapping.id,
                            expectedVersion: mapping.version,
                            state: mapping.state === "enabled" ? "disabled" : "enabled",
                          })
                        }
                      >
                        {mapping.state === "enabled" ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
        {!mappings.isPending && mappingItems.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No exact route mappings. Routes are metadata only; no framework cache is contacted.
            </CardContent>
          </Card>
        ) : null}
        {mappings.hasNextPage ? (
          <LoadMoreButton
            label="Load more mappings"
            loading={mappings.isFetchingNextPage}
            onClick={() => void mappings.fetchNextPage()}
          />
        ) : null}
      </section>

      <section aria-labelledby="delivery-history-heading" className="space-y-4">
        <div>
          <h2 id="delivery-history-heading" className="text-lg font-semibold">
            Delivery history
          </h2>
          <p className="text-muted-foreground text-sm">
            Filters are URL-backed so reload and browser navigation preserve the exact view.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Delivery filters">
          <Field>
            <FieldLabel htmlFor="delivery-endpoint-filter">Endpoint</FieldLabel>
            <NativeSelect
              id="delivery-endpoint-filter"
              value={search.endpoint ?? ""}
              onChange={(event) => updateSearch({ endpoint: event.target.value || undefined })}
            >
              <NativeSelectOption value="">All endpoints</NativeSelectOption>
              {search.endpoint &&
              !endpointItems.some((endpoint) => endpoint.id === search.endpoint) ? (
                <NativeSelectOption value={search.endpoint}>Selected endpoint</NativeSelectOption>
              ) : null}
              {endpointItems.map((endpoint) => (
                <NativeSelectOption key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="delivery-event-filter">Event type</FieldLabel>
            <NativeSelect
              id="delivery-event-filter"
              value={search.event ?? ""}
              onChange={(event) =>
                updateSearch({ event: eventTypes.find((value) => value === event.target.value) })
              }
            >
              <NativeSelectOption value="">All event types</NativeSelectOption>
              {eventTypes.map((eventType) => (
                <NativeSelectOption key={eventType} value={eventType}>
                  {eventType}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="delivery-status-filter">Status</FieldLabel>
            <NativeSelect
              id="delivery-status-filter"
              value={search.status ?? ""}
              onChange={(event) =>
                updateSearch({
                  status: deliveryStatuses.find((value) => value === event.target.value),
                })
              }
            >
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              {deliveryStatuses.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {formatStatus(status)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {deliveries.isPending ? (
          <p className="flex items-center gap-2 text-sm" role="status">
            <Spinner /> Loading deliveries…
          </p>
        ) : null}
        <div className="grid gap-3">
          {deliveryItems.map((delivery) => {
            const localized = delivery.event.type !== "cms.schema.published";
            return (
              <Card key={delivery.id}>
                <CardContent className="space-y-3 pt-6 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{delivery.event.type}</p>
                      <span className="font-mono break-all text-muted-foreground" translate="no">
                        {delivery.eventId}
                      </span>
                    </div>
                    <Badge variant={delivery.status === "succeeded" ? "default" : "secondary"}>
                      {formatStatus(delivery.status)}
                    </Badge>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    <div>
                      <dt className="text-muted-foreground">Event time</dt>
                      <dd>{formatDate(delivery.event.time)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Locale</dt>
                      <dd>{localized ? delivery.event.data.locale.tag : "Collection-wide"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Aggregate sequence</dt>
                      <dd>{delivery.event.data.aggregate.sequence}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Publication sequence</dt>
                      <dd>
                        {localized ? delivery.event.data.publication.sequence : "Not applicable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Attempts</dt>
                      <dd>{delivery.attemptCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Next retry</dt>
                      <dd>{formatDate(delivery.nextAttemptAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Final outcome</dt>
                      <dd>
                        {delivery.lastOutcome === null
                          ? "Not final"
                          : formatStatus(delivery.lastOutcome)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Delivery kind</dt>
                      <dd>{delivery.kind}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedDeliveryId(delivery.id)}
                    >
                      View event and attempts
                    </Button>
                    {canManage && delivery.status === "dead_letter" ? (
                      <ReplayDeliveryDialog
                        projectId={projectId}
                        environmentId={environmentId}
                        delivery={delivery}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!deliveries.isPending && deliveryItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No webhook deliveries match these filters.
            </p>
          ) : null}
        </div>
        {deliveries.hasNextPage ? (
          <LoadMoreButton
            label="Load more deliveries"
            loading={deliveries.isFetchingNextPage}
            onClick={() => void deliveries.fetchNextPage()}
          />
        ) : null}
        {selectedDelivery === undefined ? null : (
          <DeliveryAttempts
            projectId={projectId}
            environmentId={environmentId}
            delivery={selectedDelivery}
            onClose={() => setSelectedDeliveryId(null)}
          />
        )}
      </section>
    </main>
  );
}
