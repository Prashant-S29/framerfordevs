// Provides safe endpoint, subscription, secret-rotation, and invalidation-mapping controls.

import type {
  InvalidationRouteMapping,
  WebhookEndpoint,
  WebhookPublicEventType,
} from "@framerfordevs/api/contracts/webhooks";
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
import { Button } from "@framerfordevs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@framerfordevs/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const eventTypes = [
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
] as const satisfies ReadonlyArray<WebhookPublicEventType>;

const semanticTagPattern = /^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}$/u;
const reservedTagNamespaces = new Set([
  "project",
  "environment",
  "collection",
  "entry",
  "locale",
  "field",
]);

function destinationValidationMessage(value: string): string | null {
  if (value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      url.hostname.length === 0
    ) {
      return "Use a canonical HTTPS URL on port 443 without credentials or a fragment.";
    }
    return null;
  } catch {
    return "Enter a valid HTTPS destination URL.";
  }
}

function routeValidationMessage(value: string): string | null {
  if (value.length === 0) return null;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("*") ||
    value.includes("\\") ||
    /%(?:2e|2f|5c|3f|23)/iu.test(value) ||
    /%(?![0-9a-f]{2})/iu.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return "Use one exact origin-relative path without wildcards, traversal, query, or fragment.";
  }
  return null;
}

function parseSemanticTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().normalize("NFC"))
    .filter((tag) => tag.length > 0);
}

function semanticTagsValidationMessage(value: string): string | null {
  const tags = parseSemanticTags(value);
  if (tags.length > 10) return "Use at most 10 semantic tags.";
  if (new Set(tags).size !== tags.length) return "Semantic tags must be unique.";
  for (const tag of tags) {
    if (!semanticTagPattern.test(tag)) {
      return "Each tag must use the form namespace:value with lowercase bounded characters.";
    }
    if (reservedTagNamespaces.has(tag.split(":", 1)[0] ?? "")) {
      return "Project, environment, collection, entry, locale, and field are reserved namespaces.";
    }
  }
  return null;
}

function EventTypeCheckboxes({
  value,
  onChange,
  schemaDisabled = false,
}: {
  readonly value: ReadonlyArray<WebhookPublicEventType>;
  readonly onChange: (value: ReadonlyArray<WebhookPublicEventType>) => void;
  readonly schemaDisabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Publication events</legend>
      {eventTypes.map((eventType) => (
        <label key={eventType} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.includes(eventType)}
            disabled={schemaDisabled && eventType === "cms.schema.published"}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, eventType]
                  : value.filter((candidate) => candidate !== eventType),
              )
            }
          />
          {eventType}
        </label>
      ))}
      {schemaDisabled ? (
        <p className="text-muted-foreground text-xs">
          Schema publication is collection-wide and cannot use an entry or locale restriction.
        </p>
      ) : null}
    </fieldset>
  );
}

function SecretDisclosure({
  secret,
  description,
  onAcknowledge,
}: {
  readonly secret: string;
  readonly description: string;
  readonly onAcknowledge: () => void;
}) {
  const acknowledgementId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy the signing secret now</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <code
          className="bg-muted block min-w-0 flex-1 overflow-x-auto rounded-md p-3 text-sm"
          translate="no"
        >
          {secret}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            } catch {
              toast.error("The secret could not be copied. Select and copy it manually.");
            }
          }}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? "Copied" : "Copy secret"}
        </Button>
      </div>
      <label htmlFor={acknowledgementId} className="flex items-start gap-2 text-sm">
        <input
          id={acknowledgementId}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        I stored this secret securely. It cannot be displayed again.
      </label>
      <DialogFooter>
        <Button type="button" disabled={!acknowledged} onClick={onAcknowledge}>
          Finish
        </Button>
      </DialogFooter>
    </>
  );
}

export function CreateWebhookEndpointDialog({
  projectId,
  environmentId,
}: {
  readonly projectId: string;
  readonly environmentId: string;
}) {
  const nameId = useId();
  const destinationId = useId();
  const acknowledgementId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [subscriptions, setSubscriptions] = useState<ReadonlyArray<WebhookPublicEventType>>([
    ...eventTypes,
  ]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const destinationError = destinationValidationMessage(destination.trim());
  const create = useMutation(
    orpc.webhooks.endpoints.create.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.endpoints.list.key() });
        setIssuedSecret(response.data.secret);
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function resetAndClose() {
    setIssuedSecret(null);
    setName("");
    setDestination("");
    setDestinationTouched(false);
    setSubscriptions([...eventTypes]);
    setAcknowledged(false);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && issuedSecret !== null) return;
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New endpoint
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {issuedSecret === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Create webhook endpoint</DialogTitle>
              <DialogDescription>
                Publication events are signed and sent only to validated HTTPS destinations.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setDestinationTouched(true);
                if (destinationError !== null) return;
                create.mutate({
                  projectId,
                  environmentId,
                  name: name.trim().normalize("NFC"),
                  destination: destination.trim(),
                  subscriptions: [...subscriptions],
                  authorityAcknowledged: true,
                });
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={nameId}>Endpoint name</FieldLabel>
                  <Input
                    id={nameId}
                    value={name}
                    maxLength={100}
                    required
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field data-invalid={destinationTouched && destinationError !== null}>
                  <FieldLabel htmlFor={destinationId}>Destination URL</FieldLabel>
                  <Input
                    id={destinationId}
                    type="url"
                    value={destination}
                    maxLength={2_048}
                    required
                    placeholder="https://hooks.example.com/…"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={destinationTouched && destinationError !== null}
                    onBlur={() => setDestinationTouched(true)}
                    onChange={(event) => setDestination(event.target.value)}
                  />
                  <FieldDescription>
                    HTTPS on port 443 only. The path and query remain encrypted and masked after
                    save. DNS and public-address policy are checked by the server after
                    authorization.
                  </FieldDescription>
                  {destinationTouched ? <FieldError>{destinationError}</FieldError> : null}
                </Field>
                <EventTypeCheckboxes value={subscriptions} onChange={setSubscriptions} />
                <label htmlFor={acknowledgementId} className="flex items-start gap-2 text-sm">
                  <input
                    id={acknowledgementId}
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  I authorize environment-wide publication notifications to this destination.
                </label>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      create.isPending ||
                      !acknowledged ||
                      name.trim().length === 0 ||
                      destination.trim().length === 0 ||
                      destinationError !== null ||
                      subscriptions.length === 0
                    }
                  >
                    {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {create.isPending ? "Creating…" : "Create endpoint"}
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </>
        ) : (
          <SecretDisclosure
            secret={issuedSecret}
            description="Use this value to verify Standard Webhooks signatures. Only its encrypted form was stored."
            onAcknowledge={resetAndClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MappingEditorProps {
  readonly projectId: string;
  readonly environmentId: string;
  readonly mapping?: InvalidationRouteMapping;
}

function MappingEditorDialog({ projectId, environmentId, mapping }: MappingEditorProps) {
  const creating = mapping === undefined;
  const nameId = useId();
  const routeId = useId();
  const collectionId = useId();
  const entryId = useId();
  const localeId = useId();
  const tagsId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(mapping?.name ?? "");
  const [route, setRoute] = useState(mapping?.route ?? "");
  const [selectedCollectionId, setSelectedCollectionId] = useState(mapping?.collectionId ?? "");
  const [selectedEntryId, setSelectedEntryId] = useState(mapping?.entryId ?? "");
  const [selectedLocaleId, setSelectedLocaleId] = useState(mapping?.localeId ?? "");
  const [semanticTags, setSemanticTags] = useState(mapping?.semanticTags.join(", ") ?? "");
  const [types, setTypes] = useState<ReadonlyArray<WebhookPublicEventType>>(
    mapping?.eventTypes ?? [...eventTypes],
  );
  const [routeTouched, setRouteTouched] = useState(false);
  const [tagsTouched, setTagsTouched] = useState(false);
  const queryClient = useQueryClient();
  const collections = useInfiniteQuery({
    ...orpc.platform.projects.collections.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        environmentId,
        cursor,
        limit: 50,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
    enabled: open,
  });
  const locales = useQuery({
    ...orpc.platform.projects.locales.list.queryOptions({
      input: { projectId, view: "enabled", includeRemoved: false },
    }),
    enabled: open,
  });
  const localeItems = locales.data?.data.items ?? [];
  const listLocale = localeItems[0]?.tag ?? "";
  const entries = useInfiniteQuery({
    ...orpc.platform.projects.collections.entries.list.infiniteOptions({
      input: (cursor: string | null) => ({
        projectId,
        environmentId,
        collectionId: selectedCollectionId,
        locale: listLocale,
        cursor,
        limit: 50,
      }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
    enabled: open && selectedCollectionId.length > 0 && listLocale.length > 0,
  });
  const collectionItems = collections.data?.pages.flatMap((page) => page.data.items) ?? [];
  const entryItems = entries.data?.pages.flatMap((page) => page.data.items) ?? [];
  const narrowed = selectedEntryId.length > 0 || selectedLocaleId.length > 0;
  const routeError = routeValidationMessage(route.trim());
  const tagsError = semanticTagsValidationMessage(semanticTags);
  const create = useMutation(
    orpc.webhooks.mappings.create.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.mappings.list.key() });
        toast.success(response.message);
        setOpen(false);
        setName("");
        setRoute("");
        setSelectedCollectionId("");
        setSelectedEntryId("");
        setSelectedLocaleId("");
        setSemanticTags("");
        setTypes([...eventTypes]);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const update = useMutation(
    orpc.webhooks.mappings.update.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({ queryKey: orpc.webhooks.mappings.list.key() });
        toast.success(response.message);
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const savePending = create.isPending || update.isPending;

  function setNarrowScope(nextEntryId: string, nextLocaleId: string) {
    setSelectedEntryId(nextEntryId);
    setSelectedLocaleId(nextLocaleId);
    if (
      (nextEntryId.length > 0 || nextLocaleId.length > 0) &&
      types.includes("cms.schema.published")
    ) {
      setTypes(types.filter((type) => type !== "cms.schema.published"));
    }
  }

  const systemTags = [
    `project:${projectId}`,
    `environment:${environmentId}`,
    ...(selectedCollectionId.length > 0 ? [`collection:${selectedCollectionId}`] : []),
    ...(selectedEntryId.length > 0 ? [`entry:${selectedEntryId}`] : []),
    ...(selectedLocaleId.length > 0 ? [`locale:${selectedLocaleId}`] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={creating ? "default" : "sm"} variant="outline" />}>
        {creating ? <PlusIcon data-icon="inline-start" /> : null}
        {creating ? "New mapping" : "Edit"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{creating ? "Create" : "Edit"} invalidation mapping</DialogTitle>
          <DialogDescription>
            Snapshot exact provider-neutral route metadata into matching publication events. This
            does not contact or validate a framework cache.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setRouteTouched(true);
            setTagsTouched(true);
            if (routeError !== null || tagsError !== null || types.length === 0) return;
            const input = {
              projectId,
              environmentId,
              collectionId: selectedCollectionId,
              entryId: selectedEntryId.length === 0 ? null : selectedEntryId,
              localeId: selectedLocaleId.length === 0 ? null : selectedLocaleId,
              name: name.trim().normalize("NFC"),
              eventTypes: [...types],
              route: route.trim(),
              semanticTags: parseSemanticTags(semanticTags),
            };
            if (mapping === undefined) {
              create.mutate(input);
            } else {
              update.mutate({ ...input, mappingId: mapping.id, expectedVersion: mapping.version });
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={nameId}>Mapping name</FieldLabel>
              <Input
                id={nameId}
                value={name}
                maxLength={100}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={collectionId}>Collection</FieldLabel>
              <NativeSelect
                id={collectionId}
                value={selectedCollectionId}
                required
                onChange={(event) => {
                  setSelectedCollectionId(event.target.value);
                  setNarrowScope("", selectedLocaleId);
                }}
              >
                <NativeSelectOption value="">Select a collection</NativeSelectOption>
                {collectionItems.map((collection) => (
                  <NativeSelectOption key={collection.id} value={collection.id}>
                    {collection.displayName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {collections.hasNextPage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={collections.isFetchingNextPage}
                  onClick={() => void collections.fetchNextPage()}
                >
                  {collections.isFetchingNextPage ? "Loading…" : "Load more collections"}
                </Button>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={entryId}>Exact entry</FieldLabel>
              <NativeSelect
                id={entryId}
                value={selectedEntryId}
                disabled={selectedCollectionId.length === 0 || listLocale.length === 0}
                onChange={(event) => setNarrowScope(event.target.value, selectedLocaleId)}
              >
                <NativeSelectOption value="">All entries in this collection</NativeSelectOption>
                {entryItems.map((item) => (
                  <NativeSelectOption key={item.entry.id} value={item.entry.id}>
                    {item.displayName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Optional. Entry names are used only to select a stable ID.
              </FieldDescription>
              {entries.hasNextPage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={entries.isFetchingNextPage}
                  onClick={() => void entries.fetchNextPage()}
                >
                  {entries.isFetchingNextPage ? "Loading…" : "Load more entries"}
                </Button>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={localeId}>Exact locale</FieldLabel>
              <NativeSelect
                id={localeId}
                value={selectedLocaleId}
                onChange={(event) => setNarrowScope(selectedEntryId, event.target.value)}
              >
                <NativeSelectOption value="">All locales</NativeSelectOption>
                {localeItems.map((locale) => (
                  <NativeSelectOption key={locale.id} value={locale.id}>
                    {locale.displayName} ({locale.tag})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Optional. Locale matching remains exact and independent.
              </FieldDescription>
            </Field>
            <Field data-invalid={routeTouched && routeError !== null}>
              <FieldLabel htmlFor={routeId}>Exact route path</FieldLabel>
              <Input
                id={routeId}
                value={route}
                maxLength={512}
                required
                placeholder="/articles/example"
                aria-invalid={routeTouched && routeError !== null}
                onBlur={() => setRouteTouched(true)}
                onChange={(event) => setRoute(event.target.value)}
              />
              <FieldDescription>
                Origin-relative only. Wildcards, traversal, query strings, and fragments are
                rejected.
              </FieldDescription>
              {routeTouched ? <FieldError>{routeError}</FieldError> : null}
            </Field>
            <Field data-invalid={tagsTouched && tagsError !== null}>
              <FieldLabel htmlFor={tagsId}>Semantic tags</FieldLabel>
              <Input
                id={tagsId}
                value={semanticTags}
                placeholder="content:article, page:home"
                aria-invalid={tagsTouched && tagsError !== null}
                onBlur={() => setTagsTouched(true)}
                onChange={(event) => setSemanticTags(event.target.value)}
              />
              <FieldDescription>
                Optional comma-separated tags. Up to 10; system namespaces are reserved.
              </FieldDescription>
              {tagsTouched ? <FieldError>{tagsError}</FieldError> : null}
            </Field>
            <EventTypeCheckboxes value={types} onChange={setTypes} schemaDisabled={narrowed} />
            <div className="space-y-2 rounded-md border p-3 text-xs">
              <p className="font-medium">Read-only system tag preview</p>
              <div className="flex flex-wrap gap-2">
                {systemTags.map((tag) => (
                  <code key={tag} className="bg-muted break-all rounded px-2 py-1" translate="no">
                    {tag}
                  </code>
                ))}
              </div>
              <p className="text-muted-foreground">
                Publication-specific entry, locale, and changed-field tags may be added by the
                server.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  savePending ||
                  selectedCollectionId.length === 0 ||
                  name.trim().length === 0 ||
                  route.trim().length === 0 ||
                  routeError !== null ||
                  tagsError !== null ||
                  types.length === 0
                }
              >
                {savePending ? <Spinner data-icon="inline-start" /> : null}
                {savePending ? "Saving…" : creating ? "Create mapping" : "Save mapping"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateInvalidationMappingDialog(props: Omit<MappingEditorProps, "mapping">) {
  return <MappingEditorDialog {...props} />;
}

export function EditInvalidationMappingDialog(props: Required<MappingEditorProps>) {
  return <MappingEditorDialog {...props} />;
}

export function WebhookEndpointActions({
  projectId,
  environmentId,
  endpoint,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly endpoint: WebhookEndpoint;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editedName, setEditedName] = useState<string>(endpoint.name);
  const [replacementDestination, setReplacementDestination] = useState("");
  const [destinationAcknowledged, setDestinationAcknowledged] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<ReadonlyArray<WebhookPublicEventType>>(
    endpoint.subscriptions,
  );
  const [rotationOpen, setRotationOpen] = useState(false);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.webhooks.endpoints.list.key() });
  const update = useMutation(
    orpc.webhooks.endpoints.update.mutationOptions({
      onSuccess: async (response) => {
        await refresh();
        setEditOpen(false);
        setReplacementDestination("");
        setDestinationAcknowledged(false);
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const state = useMutation(
    orpc.webhooks.endpoints.setState.mutationOptions({
      onSuccess: async (response) => {
        await refresh();
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const replaceSubscriptions = useMutation(
    orpc.webhooks.endpoints.replaceSubscriptions.mutationOptions({
      onSuccess: async (response) => {
        await refresh();
        setSubscriptionsOpen(false);
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const startRotation = useMutation(
    orpc.webhooks.endpoints.startRotation.mutationOptions({
      onSuccess: async (response) => {
        await refresh();
        setPendingSecret(response.data.secret);
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const changeRotation = useMutation(
    orpc.webhooks.endpoints.changeRotation.mutationOptions({
      onSuccess: async (response) => {
        await refresh();
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const scope = { projectId, environmentId, endpointId: endpoint.id };
  const replacement = replacementDestination.trim();
  const replacementError = destinationValidationMessage(replacement);
  const removedSubscriptions = endpoint.subscriptions.filter(
    (eventType) => !subscriptions.includes(eventType),
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit endpoint</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit webhook endpoint</DialogTitle>
            <DialogDescription>
              Leave the destination blank to retain the encrypted current value.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (replacementError !== null || (replacement.length > 0 && !destinationAcknowledged))
                return;
              update.mutate({
                ...scope,
                expectedVersion: endpoint.version,
                name: editedName.trim().normalize("NFC"),
                ...(replacement.length === 0 ? {} : { destination: replacement }),
              });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`webhook-name-${endpoint.id}`}>Endpoint name</FieldLabel>
                <Input
                  id={`webhook-name-${endpoint.id}`}
                  value={editedName}
                  maxLength={100}
                  required
                  onChange={(event) => setEditedName(event.target.value)}
                />
              </Field>
              <Field data-invalid={replacementError !== null}>
                <FieldLabel htmlFor={`webhook-destination-${endpoint.id}`}>
                  Replacement destination
                </FieldLabel>
                <Input
                  id={`webhook-destination-${endpoint.id}`}
                  type="url"
                  value={replacementDestination}
                  maxLength={2_048}
                  placeholder="Keep current encrypted destination"
                  autoComplete="off"
                  aria-invalid={replacementError !== null}
                  onChange={(event) => {
                    setReplacementDestination(event.target.value);
                    setDestinationAcknowledged(false);
                  }}
                />
                <FieldError>{replacementError}</FieldError>
              </Field>
              {replacement.length > 0 ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={destinationAcknowledged}
                    onChange={(event) => setDestinationAcknowledged(event.target.checked)}
                  />
                  I understand destination replacement cancels queued and retry-scheduled
                  deliveries; in-flight delivery may still complete at least once.
                </label>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    update.isPending ||
                    editedName.trim().length === 0 ||
                    replacementError !== null ||
                    (replacement.length > 0 && !destinationAcknowledged)
                  }
                >
                  {update.isPending ? <Spinner data-icon="inline-start" /> : null}
                  {update.isPending ? "Saving…" : "Save endpoint"}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={subscriptionsOpen} onOpenChange={setSubscriptionsOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          Edit subscriptions
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace event subscriptions</DialogTitle>
            <DialogDescription>
              Added event types apply only to future events. Removed types cancel queued and
              retry-scheduled deliveries; an in-flight attempt may still complete at least once.
            </DialogDescription>
          </DialogHeader>
          <EventTypeCheckboxes value={subscriptions} onChange={setSubscriptions} />
          {removedSubscriptions.length > 0 ? (
            <p className="text-destructive text-sm" role="alert">
              Removing {removedSubscriptions.join(", ")} will cancel eligible queued deliveries.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionsOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={replaceSubscriptions.isPending || subscriptions.length === 0}
              onClick={() =>
                replaceSubscriptions.mutate({
                  ...scope,
                  expectedVersion: endpoint.version,
                  subscriptions: [...subscriptions],
                })
              }
            >
              {replaceSubscriptions.isPending ? <Spinner data-icon="inline-start" /> : null}
              {replaceSubscriptions.isPending ? "Saving…" : "Confirm subscriptions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {endpoint.state === "enabled" ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
            Disable
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable {endpoint.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Queued and retry-scheduled deliveries will be canceled. An in-flight delivery may
                still complete at least once. Re-enabling applies only to future events; older
                events require manual replay.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={state.isPending}>Keep enabled</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={state.isPending}
                onClick={() =>
                  state.mutate({ ...scope, expectedVersion: endpoint.version, state: "disabled" })
                }
              >
                {state.isPending ? <Spinner data-icon="inline-start" /> : null}
                {state.isPending ? "Disabling…" : "Disable endpoint"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={state.isPending}
          onClick={() =>
            state.mutate({ ...scope, expectedVersion: endpoint.version, state: "enabled" })
          }
        >
          {state.isPending ? "Enabling…" : "Enable"}
        </Button>
      )}

      <Dialog
        open={rotationOpen}
        onOpenChange={(next) => {
          if (!next && pendingSecret !== null) return;
          setRotationOpen(next);
        }}
      >
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <KeyRoundIcon data-icon="inline-start" />
          Rotate secret
        </DialogTrigger>
        <DialogContent>
          {pendingSecret === null ? (
            <>
              <DialogHeader>
                <DialogTitle>Rotate signing secret</DialogTitle>
                <DialogDescription>
                  Generate and install the next secret before activating the fixed 24-hour overlap.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRotationOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={startRotation.isPending || endpoint.rotationState !== "active"}
                  onClick={() =>
                    startRotation.mutate({
                      ...scope,
                      expectedVersion: endpoint.version,
                      authorityAcknowledged: true,
                    })
                  }
                >
                  {startRotation.isPending ? <Spinner data-icon="inline-start" /> : null}
                  Generate next secret
                </Button>
              </DialogFooter>
            </>
          ) : (
            <SecretDisclosure
              secret={pendingSecret}
              description="Install this pending secret at the receiver, then activate overlap from the endpoint controls."
              onAcknowledge={() => {
                setPendingSecret(null);
                setRotationOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {endpoint.rotationState === "pending" ? (
        <>
          <Button
            size="sm"
            disabled={changeRotation.isPending}
            onClick={() =>
              changeRotation.mutate({
                ...scope,
                expectedVersion: endpoint.version,
                action: "activate",
              })
            }
          >
            Activate 24-hour overlap
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={changeRotation.isPending}
            onClick={() =>
              changeRotation.mutate({
                ...scope,
                expectedVersion: endpoint.version,
                action: "cancel",
              })
            }
          >
            Cancel rotation
          </Button>
        </>
      ) : null}
      {endpoint.rotationState === "retiring" ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
            Retire old secret
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retire the old signing secret now?</AlertDialogTitle>
              <AlertDialogDescription>
                This ends the overlap early. Receivers that have not installed the new secret will
                reject future signatures. This cannot restore the retired secret.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={changeRotation.isPending}>
                Keep overlap
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={changeRotation.isPending}
                onClick={() =>
                  changeRotation.mutate({
                    ...scope,
                    expectedVersion: endpoint.version,
                    action: "complete",
                  })
                }
              >
                {changeRotation.isPending ? <Spinner data-icon="inline-start" /> : null}
                {changeRotation.isPending ? "Retiring…" : "Retire old secret"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
