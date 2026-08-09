// Renders a locale-neutral M7 stable-entry list with named creation and cursor pagination.

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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { entryNameSchema } from "@/lib/cms-validation";
import { client, orpc } from "@/utils/orpc";

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function CollectionEntries({
  projectId,
  collectionId,
}: {
  readonly projectId: string;
  readonly collectionId: string;
}) {
  const [additionalItems, setAdditionalItems] = useState<
    ReadonlyArray<{
      entry: { id: string; updatedAt: string };
      displayName: string;
    }>
  >([]);
  const [loadedNextCursor, setLoadedNextCursor] = useState<string | null>();
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const locales = useQuery(
    orpc.platform.projects.locales.list.queryOptions({
      input: { projectId, view: "enabled", includeRemoved: false },
    }),
  );
  const environmentId = project.data?.data.environment.id ?? "";
  const localeItems = useMemo(() => locales.data?.data.items ?? [], [locales.data]);
  const locale = localeItems[0]?.tag ?? "";
  const collection = useQuery({
    ...orpc.platform.projects.collections.get.queryOptions({
      input: { projectId, environmentId, collectionId },
    }),
    enabled: Boolean(environmentId),
    retry: false,
  });
  const publishedRevisionId = collection.data?.data.currentPublishedRevisionId;
  const hasPublishedSchema = typeof publishedRevisionId === "string";
  const publishedForm = useQuery({
    ...orpc.platform.projects.collections.schema.form.getPublished.queryOptions({
      input: {
        projectId,
        environmentId,
        collectionId,
        revisionId: publishedRevisionId ?? null,
      },
    }),
    enabled: Boolean(environmentId && hasPublishedSchema),
    retry: false,
  });
  const pageQuery = useQuery({
    ...orpc.platform.projects.collections.entries.list.queryOptions({
      input: { projectId, environmentId, collectionId, locale, cursor: null, limit: 25 },
    }),
    enabled: Boolean(environmentId && locale && publishedForm.data),
    retry: false,
  });

  useEffect(() => {
    setAdditionalItems([]);
    setLoadedNextCursor(undefined);
  }, [locale]);

  const loadMore = useMutation({
    mutationFn: (cursor: string) =>
      client.platform.projects.collections.entries.list({
        projectId,
        environmentId,
        collectionId,
        locale,
        cursor,
        limit: 25,
      }),
    onSuccess: (response) => {
      setAdditionalItems((current) => [...current, ...response.data.items]);
      setLoadedNextCursor(response.data.nextCursor);
    },
    onError: (error) => toast.error(error.message),
  });

  if (project.isPending || access.isPending || locales.isPending || collection.isPending) {
    return (
      <Card>
        <CardContent className="flex min-h-40 items-center justify-center">
          <Spinner />
          <span className="sr-only">Loading entries</span>
        </CardContent>
      </Card>
    );
  }
  if (!project.data || !access.data || !locales.data || !collection.data) return null;

  const canWrite = access.data.data.allowedActions.includes("content.write");
  const firstPage = pageQuery.data?.data;
  const items = [...(firstPage?.items ?? []), ...additionalItems];
  const nextCursor = loadedNextCursor === undefined ? firstPage?.nextCursor : loadedNextCursor;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Collection workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Entries</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every row is one stable content identity containing all locale drafts.
          </p>
        </div>
        {canWrite && hasPublishedSchema && publishedForm.data && locale ? (
          <CreateEntryDialog
            projectId={projectId}
            environmentId={environmentId}
            collectionId={collectionId}
            locale={locale}
            schemaRevisionId={publishedForm.data.data.revisionId ?? ""}
            contractHash={publishedForm.data.data.contractHash}
          />
        ) : null}
      </header>

      <nav aria-label="Collection sections" className="flex gap-2">
        <Button variant="default" size="sm">
          Entries
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              to="/projects/$projectId/collections/$collectionId"
              params={{ projectId, collectionId }}
            />
          }
        >
          Schema
        </Button>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Content entries</CardTitle>
          <CardDescription>
            Ordered by immutable creation time. Locale-specific content is selected inside an entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {localeItems.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No locale access</EmptyTitle>
                <EmptyDescription>
                  An enabled authorized locale is required to read entries.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !hasPublishedSchema ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Publish the schema first</EmptyTitle>
                <EmptyDescription>
                  Entries require the collection’s current published schema contract.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : publishedForm.isPending || pageQuery.isPending ? (
            <div className="flex min-h-32 items-center justify-center">
              <Spinner />
              <span className="sr-only">Loading entry page</span>
            </div>
          ) : publishedForm.isError ? (
            <div role="alert" className="rounded-md border border-destructive p-4">
              <p className="font-medium">The published schema could not be loaded.</p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void publishedForm.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : pageQuery.isError ? (
            <div role="alert" className="rounded-md border border-destructive p-4">
              <p className="font-medium">Entries could not be loaded.</p>
              <Button className="mt-3" variant="outline" onClick={() => void pageQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No entries yet</EmptyTitle>
                <EmptyDescription>
                  Create one stable entry, then add its localized values.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            items.map((item) => (
              <article
                key={item.entry.id}
                className="flex min-w-0 items-center justify-between gap-4 rounded-lg border p-4 [contain-intrinsic-size:auto_84px] [content-visibility:auto]"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{item.displayName}</h2>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Updated {dateFormatter.format(new Date(item.entry.updatedAt))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      to="/projects/$projectId/collections/$collectionId/entries/$entryId"
                      params={{ projectId, collectionId, entryId: item.entry.id }}
                      search={{ locale }}
                    />
                  }
                >
                  Open <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </article>
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
    </div>
  );
}

export function CreateEntryDialog({
  projectId,
  environmentId,
  collectionId,
  locale,
  schemaRevisionId,
  contractHash,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly locale: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const parsed = entryNameSchema.safeParse(displayName);
  const error = submitted && !parsed.success ? parsed.error.issues[0]?.message : undefined;
  const create = useMutation({
    mutationFn: (name: string) =>
      client.platform.projects.collections.entries.create({
        projectId,
        environmentId,
        collectionId,
        locale,
        displayName: name,
        schemaRevisionId,
        contractHash,
        commandId: crypto.randomUUID(),
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: orpc.platform.projects.collections.entries.list.key(),
      });
      toast.success(response.message);
      setDisplayName("");
      setSubmitted(false);
      setOpen(false);
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && displayName.trim() && !globalThis.confirm("Discard this entry name?"))
          return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New entry
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an entry</DialogTitle>
          <DialogDescription>
            This management name identifies the entry across every locale and is not delivered as
            content.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (parsed.success) create.mutate(parsed.data.normalize("NFC"));
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="entry-display-name">Entry name</FieldLabel>
              <Input
                id="entry-display-name"
                name="entry-display-name"
                value={displayName}
                maxLength={100}
                autoComplete="off"
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setSubmitted(false);
                }}
              />
              <FieldDescription>
                For example, “Main Homepage” or “Blog — Product launch”.
              </FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                {create.isPending ? "Creating…" : "Create entry"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
