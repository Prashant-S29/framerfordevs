import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cmsKeyFromName, collectionFormSchema } from "@/lib/cms-validation";
import { client, orpc } from "@/utils/orpc";

function fieldError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

export function ProjectCollections({
  projectId,
  environmentId,
  canWrite,
  isArchived,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly canWrite: boolean;
  readonly isArchived: boolean;
}) {
  const [additionalItems, setAdditionalItems] = useState<
    ReadonlyArray<{
      id: string;
      displayName: string;
      apiKey: string;
      draftVersion: number;
      currentPublishedSequence: number;
    }>
  >([]);
  const [loadedNextCursor, setLoadedNextCursor] = useState<string | null>();
  const collections = useQuery(
    orpc.platform.projects.collections.list.queryOptions({
      input: { projectId, environmentId, cursor: null, limit: 20 },
    }),
  );
  const loadMore = useMutation({
    mutationFn: (cursor: string) =>
      client.platform.projects.collections.list({ projectId, environmentId, cursor, limit: 20 }),
    onSuccess: (response) => {
      setAdditionalItems((current) => [...current, ...response.data.items]);
      setLoadedNextCursor(response.data.nextCursor);
    },
    onError: (error) => toast.error(error.message),
  });

  if (collections.isPending || !collections.data) {
    return (
      <Card>
        <CardContent className="flex min-h-32 items-center justify-center">
          <Spinner />
          <span className="sr-only">Loading collections</span>
        </CardContent>
      </Card>
    );
  }

  const page = collections.data.data;
  const items = [...page.items, ...additionalItems];
  const nextCursor = loadedNextCursor === undefined ? page.nextCursor : loadedNextCursor;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Collections</CardTitle>
          <CardDescription>Versioned content contracts for the main environment.</CardDescription>
        </div>
        {canWrite && !isArchived ? (
          <CreateCollectionDialog projectId={projectId} environmentId={environmentId} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No collections yet</EmptyTitle>
              <EmptyDescription>
                Create a collection to define your first content contract.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          items.map((collection) => (
            <div
              key={collection.id}
              className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-3 [contain-intrinsic-size:auto_72px] [content-visibility:auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{collection.displayName}</p>
                  <Badge
                    variant={collection.currentPublishedSequence > 0 ? "default" : "secondary"}
                  >
                    {collection.currentPublishedSequence > 0
                      ? `Published v${collection.currentPublishedSequence}`
                      : "Draft only"}
                  </Badge>
                </div>
                <p className="text-muted-foreground truncate font-mono text-xs" translate="no">
                  {collection.apiKey}
                </p>
                {canWrite ? (
                  <p className="text-muted-foreground text-xs">
                    Draft version {collection.draftVersion}
                  </p>
                ) : null}
              </div>
              {canWrite && !isArchived ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      to="/projects/$projectId/collections/$collectionId"
                      params={{ projectId, collectionId: collection.id }}
                    />
                  }
                >
                  Open builder <ArrowRightIcon data-icon="inline-end" />
                </Button>
              ) : null}
            </div>
          ))
        )}
        {nextCursor ? (
          <Button
            variant="outline"
            disabled={loadMore.isPending}
            onClick={() => loadMore.mutate(nextCursor)}
          >
            {loadMore.isPending ? <Spinner data-icon="inline-start" /> : null}
            {loadMore.isPending ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CreateCollectionDialog({
  projectId,
  environmentId,
}: {
  readonly projectId: string;
  readonly environmentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [keyEdited, setKeyEdited] = useState(false);
  const queryClient = useQueryClient();
  const create = useMutation(
    orpc.platform.projects.collections.create.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.list.queryOptions({
            input: { projectId, environmentId, cursor: null, limit: 20 },
          }).queryKey,
        });
        toast.success(response.message);
        form.reset();
        setKeyEdited(false);
        setOpen(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const form = useForm({
    defaultValues: { displayName: "", apiKey: "", description: "" },
    validators: { onSubmit: collectionFormSchema },
    onSubmit: ({ value }) =>
      create.mutate({
        projectId,
        environmentId,
        displayName: value.displayName.trim().normalize("NFC"),
        apiKey: value.apiKey.trim(),
        description: value.description.trim().normalize("NFC") || null,
      }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (
          !nextOpen &&
          form.state.isDirty &&
          !globalThis.confirm("Discard your unsaved collection changes?")
        ) {
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        New collection
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a collection</DialogTitle>
          <DialogDescription>
            The API key is immutable and becomes part of generated contracts.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="displayName">
              {(field) => {
                const message = fieldError(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      maxLength={100}
                      autoComplete="off"
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        const value = event.target.value;
                        field.handleChange(value);
                        if (!keyEdited) form.setFieldValue("apiKey", cmsKeyFromName(value));
                      }}
                      aria-invalid={Boolean(message)}
                    />
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="apiKey">
              {(field) => {
                const message = fieldError(field.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={field.name}>API key</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      maxLength={63}
                      spellCheck={false}
                      autoComplete="off"
                      translate="no"
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setKeyEdited(true);
                        field.handleChange(event.target.value.toLowerCase());
                      }}
                      aria-invalid={Boolean(message)}
                    />
                    <FieldDescription>
                      Lowercase snake case. It cannot be changed later.
                    </FieldDescription>
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    maxLength={500}
                    autoComplete="off"
                    rows={3}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <FieldDescription>Optional authoring context.</FieldDescription>
                </Field>
              )}
            </form.Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.canSubmit}>
                {(canSubmit) => (
                  <Button type="submit" disabled={!canSubmit || create.isPending}>
                    {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                    {create.isPending ? "Creating…" : "Create collection"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
