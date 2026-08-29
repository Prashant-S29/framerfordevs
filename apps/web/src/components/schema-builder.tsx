import type {
  DeliveryAccess,
  DeliveryCollectionConfiguration,
  DeliveryFieldCapability,
} from "@framerfordevs/api/contracts/delivery/index";
import type { CollectionFieldDefinition } from "@framerfordevs/api/contracts/schema/index";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import { Field, FieldLabel } from "@framerfordevs/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, Code2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function SchemaBuilder({
  projectId,
  collectionId,
}: {
  readonly projectId: string;
  readonly collectionId: string;
}) {
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const environmentId = project.data?.data.environment.id;
  const scope = {
    projectId,
    environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
    collectionId,
  };
  const draft = useQuery({
    ...orpc.platform.projects.collections.schema.draft.get.queryOptions({ input: scope }),
    enabled: Boolean(environmentId),
  });
  const deliveryConfiguration = useQuery({
    ...orpc.platform.projects.collections.deliveryConfiguration.get.queryOptions({ input: scope }),
    enabled: Boolean(environmentId),
  });
  const publishedRevisionId = draft.data?.data.collection.currentPublishedRevisionId;
  const published = useQuery({
    ...orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
      input: {
        ...scope,
        revisionId: publishedRevisionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(environmentId && publishedRevisionId),
  });

  if (project.isPending || access.isPending || draft.isPending || deliveryConfiguration.isPending) {
    return (
      <main className="mx-auto flex min-h-64 w-full max-w-5xl items-center justify-center">
        <Spinner />
        <span className="sr-only">Loading collection management</span>
      </main>
    );
  }
  if (!project.data || !access.data || !draft.data || !deliveryConfiguration.data || !environmentId)
    return null;

  const projectModel = project.data.data;
  const draftModel = draft.data.data;
  const allowed = new Set(access.data.data.allowedActions);
  const canConfigureDelivery =
    allowed.has("delivery.configure") && projectModel.archivedAt === null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" render={<Link to="/projects/$projectId" params={{ projectId }} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to project
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={
              <Link
                to="/projects/$projectId/collections/$collectionId/entries"
                params={{ projectId, collectionId }}
              />
            }
          >
            Edit content
          </Button>
          {publishedRevisionId === null ? null : (
            <Button
              variant="outline"
              render={
                <Link
                  to="/projects/$projectId/collections/$collectionId/presentation"
                  params={{ projectId, collectionId }}
                />
              }
            >
              Edit presentation
            </Button>
          )}
        </div>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={draftModel.collection.currentPublishedSequence > 0 ? "default" : "secondary"}
          >
            {draftModel.collection.currentPublishedSequence > 0
              ? `Published v${draftModel.collection.currentPublishedSequence}`
              : "Awaiting code push"}
          </Badge>
          <Badge variant="outline">Managed revision {draftModel.collection.draftVersion}</Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {draftModel.collection.displayName}
          </h1>
          <p className="text-muted-foreground font-mono text-sm" translate="no">
            {draftModel.collection.apiKey}
          </p>
        </div>
        <p className="text-muted-foreground max-w-3xl text-sm">
          {draftModel.collection.description ?? "No collection description."}
        </p>
      </header>

      <CodeManagedStructureCard
        fields={published.data?.data.fields ?? draftModel.fields}
        revisionId={published.data?.data.id ?? null}
      />

      <DeliveryConfigurationCard
        scope={scope}
        configuration={deliveryConfiguration.data.data}
        publishedFields={published.data?.data.fields ?? []}
        hasPublishedSchema={published.data !== undefined}
        canConfigure={canConfigureDelivery}
      />
    </main>
  );
}

export function CodeManagedStructureCard({
  fields,
  revisionId,
}: {
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly revisionId: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Code2Icon aria-hidden="true" />
          <CardTitle role="heading" aria-level={2}>
            Structure is managed in code
          </CardTitle>
        </div>
        <CardDescription>
          Export the project, change source-controlled schema, inspect the plan, and push with exact
          acknowledgements. Dashboard structure mutation has been retired.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fields are available yet. Push the complete project schema from code.
          </p>
        ) : (
          <ul aria-label="Current managed fields" className="divide-y rounded-md border">
            {fields.map((field) => (
              <li key={field.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{field.displayLabel}</span>
                <span className="text-muted-foreground font-mono text-xs" translate="no">
                  {field.apiKey ?? "list-item"}
                </span>
                <Badge variant="outline">{field.kind}</Badge>
                <Badge variant="secondary">{field.localization}</Badge>
              </li>
            ))}
          </ul>
        )}
        {revisionId === null ? null : (
          <p className="text-muted-foreground text-xs">
            Current immutable revision:{" "}
            <span className="break-all font-mono" translate="no">
              {revisionId}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const deliveryKinds = new Set<string>([
  "short_text",
  "slug",
  "email",
  "enum",
  "number",
  "decimal",
  "boolean",
  "date",
  "date_time",
  "reference",
]);

function isDeliveryKind(kind: string): kind is DeliveryFieldCapability["kind"] {
  return deliveryKinds.has(kind);
}

export function DeliveryConfigurationCard({
  scope,
  configuration,
  publishedFields,
  hasPublishedSchema,
  canConfigure,
}: {
  readonly scope: { projectId: string; environmentId: string; collectionId: string };
  readonly configuration: DeliveryCollectionConfiguration;
  readonly publishedFields: ReadonlyArray<CollectionFieldDefinition>;
  readonly hasPublishedSchema: boolean;
  readonly canConfigure: boolean;
}) {
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<DeliveryAccess>(configuration.access);
  const [publicAcknowledged, setPublicAcknowledged] = useState(false);
  const [capabilities, setCapabilities] = useState(
    () => new Map(configuration.fields.map((field) => [field.fieldId, field])),
  );
  const queryKey = orpc.platform.projects.collections.deliveryConfiguration.get.queryOptions({
    input: scope,
  }).queryKey;
  const update = useMutation(
    orpc.platform.projects.collections.deliveryConfiguration.update.mutationOptions({
      onSuccess: async (response) => {
        setAccess(response.data.access);
        setCapabilities(new Map(response.data.fields.map((field) => [field.fieldId, field])));
        setPublicAcknowledged(false);
        await queryClient.invalidateQueries({ queryKey });
        toast.success(response.message);
      },
      onError: async (error) => {
        await queryClient.invalidateQueries({ queryKey });
        toast.error(error.message);
      },
    }),
  );
  const fields = publishedFields.filter(
    (field) => field.nodeRole === "root" && field.apiKey !== null && isDeliveryKind(field.kind),
  );
  const setCapability = (
    field: CollectionFieldDefinition,
    key: "filterable" | "sortable" | "uniqueLookup",
    checked: boolean,
  ) => {
    if (field.apiKey === null || !isDeliveryKind(field.kind)) return;
    const fieldKey = field.apiKey;
    const kind = field.kind;
    setCapabilities((current) => {
      const next = new Map(current);
      const previous = next.get(field.id) ?? {
        fieldId: field.id,
        fieldKey,
        kind,
        filterable: false,
        sortable: false,
        uniqueLookup: false,
      };
      const changed = {
        ...previous,
        [key]: checked,
        filterable: key === "uniqueLookup" && checked ? true : previous.filterable,
      };
      if (!changed.filterable && !changed.sortable && !changed.uniqueLookup) next.delete(field.id);
      else next.set(field.id, changed);
      return next;
    });
  };
  const save = () =>
    update.mutate({
      ...scope,
      expectedVersion: configuration.version,
      access,
      publicAccessAcknowledged: publicAcknowledged,
      fields: [...capabilities.values()],
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Delivery API</CardTitle>
        <CardDescription>
          Collections are protected by default. Query capabilities apply only to current published
          scalar projections; every response still returns the complete immutable publication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field>
          <FieldLabel htmlFor="delivery-access">Collection access</FieldLabel>
          <NativeSelect
            id="delivery-access"
            value={access}
            disabled={!canConfigure || !hasPublishedSchema || update.isPending}
            onChange={(event) =>
              setAccess(event.target.value === "public" ? "public" : "protected")
            }
          >
            <NativeSelectOption value="protected">
              Protected — Delivery credential required
            </NativeSelectOption>
            <NativeSelectOption value="public">Public — anonymous reads allowed</NativeSelectOption>
          </NativeSelect>
        </Field>
        {access === "public" && configuration.access !== "public" ? (
          <Field orientation="horizontal">
            <Checkbox
              id="delivery-public-acknowledgement"
              checked={publicAcknowledged}
              onCheckedChange={(checked) => setPublicAcknowledged(checked === true)}
            />
            <FieldLabel htmlFor="delivery-public-acknowledgement">
              I understand that anonymous callers can download latest and known immutable
              publications, and external caches cannot be revoked by making this collection
              protected again.
            </FieldLabel>
          </Field>
        ) : null}
        <Separator />
        <fieldset
          className="space-y-3"
          disabled={!canConfigure || !hasPublishedSchema || update.isPending}
        >
          <legend className="text-sm font-medium">Current published root scalar fields</legend>
          {fields.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Push schema code with supported root scalar fields before enabling Delivery queries.
            </p>
          ) : (
            fields.map((field) => {
              const capability = capabilities.get(field.id);
              const uniqueSupported = field.kind !== "boolean";
              return (
                <div key={field.id} className="rounded-md border p-3">
                  <p className="font-mono text-sm" translate="no">
                    {field.apiKey}
                  </p>
                  <p className="text-muted-foreground mb-3 text-xs">{field.kind}</p>
                  <div className="flex flex-wrap gap-4">
                    {(["filterable", "sortable", "uniqueLookup"] as const).map((key) => (
                      <Field orientation="horizontal" key={key}>
                        <Checkbox
                          id={`delivery-${field.id}-${key}`}
                          checked={capability?.[key] ?? false}
                          disabled={key === "uniqueLookup" && !uniqueSupported}
                          onCheckedChange={(checked) => setCapability(field, key, checked === true)}
                        />
                        <FieldLabel htmlFor={`delivery-${field.id}-${key}`}>
                          {key === "uniqueLookup"
                            ? "Unique lookup"
                            : key === "filterable"
                              ? "Filter"
                              : "Sort"}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </fieldset>
        {!canConfigure ? (
          <p className="text-muted-foreground text-sm">
            Owner or unrestricted developer access is required to change Delivery exposure.
          </p>
        ) : null}
        <Button
          type="button"
          disabled={
            !canConfigure ||
            !hasPublishedSchema ||
            update.isPending ||
            (access === "public" && configuration.access !== "public" && !publicAcknowledged)
          }
          onClick={save}
        >
          {update.isPending ? "Saving Delivery settings…" : "Save Delivery settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
