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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

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
      <CardHeader>
        <CardTitle>Collections</CardTitle>
        <CardDescription>
          Structure is managed through code-first schema authoring. The dashboard retains content,
          presentation, and Delivery controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No collections yet</EmptyTitle>
              <EmptyDescription>
                Define a collection in schema code, inspect its plan, and push it to this
                environment.
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
                      : "Awaiting code push"}
                  </Badge>
                </div>
                <p className="text-muted-foreground truncate font-mono text-xs" translate="no">
                  {collection.apiKey}
                </p>
                {canWrite ? (
                  <p className="text-muted-foreground text-xs">
                    Managed revision {collection.draftVersion}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      to="/projects/$projectId/collections/$collectionId/entries"
                      params={{ projectId, collectionId: collection.id }}
                    />
                  }
                >
                  Entries <ArrowRightIcon data-icon="inline-end" />
                </Button>
                {canWrite && !isArchived ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <Link
                        to="/projects/$projectId/collections/$collectionId"
                        params={{ projectId, collectionId: collection.id }}
                      />
                    }
                  >
                    Manage
                  </Button>
                ) : null}
              </div>
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
