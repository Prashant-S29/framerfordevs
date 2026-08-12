// Routes credential-free dashboard Preview with strict URL-authoritative current or historical source state.

import { Button, buttonVariants } from "@framerfordevs/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  EntryPreview,
  type EntryPreviewSearch,
  isValidRevisionPreviewSearch,
} from "@/components/entry-preview";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function boundedString(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : undefined;
}

function revisionSelector(value: unknown): string | undefined {
  const candidate = boundedString(value, 36);
  return candidate === "none" || (candidate !== undefined && uuidPattern.test(candidate))
    ? candidate
    : undefined;
}

export function validateEntryPreviewSearch(search: Record<string, unknown>): EntryPreviewSearch {
  const locale = boundedString(search.locale, 64) ?? "";
  if (search.source !== "revision") return { locale, source: "current" };
  const schemaRevisionId = boundedString(search.schemaRevisionId, 36);
  return {
    locale,
    source: "revision",
    ...(schemaRevisionId !== undefined && uuidPattern.test(schemaRevisionId)
      ? { schemaRevisionId }
      : {}),
    ...(revisionSelector(search.sharedRevision) === undefined
      ? {}
      : { sharedRevision: revisionSelector(search.sharedRevision) }),
    ...(revisionSelector(search.localizedRevision) === undefined
      ? {}
      : { localizedRevision: revisionSelector(search.localizedRevision) }),
  };
}

export const Route = createFileRoute(
  "/_auth/projects/$projectId_/collections/$collectionId_/entries_/$entryId_/preview",
)({
  validateSearch: validateEntryPreviewSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    const [project, locales] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.get.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.locales.list.queryOptions({
          input: { projectId: params.projectId, view: "enabled", includeRemoved: false },
        }),
      ),
    ]);
    const environmentId = project.data.environment.id;
    const scope = {
      projectId: params.projectId,
      environmentId,
      collectionId: params.collectionId,
      entryId: params.entryId,
      locale: deps.locale,
    };
    const exactLocaleAvailable = locales.data.items.some((locale) => locale.tag === deps.locale);
    const baseQueries = [
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.get.queryOptions({
          input: {
            projectId: params.projectId,
            environmentId,
            collectionId: params.collectionId,
          },
        }),
      ),
    ];
    if (!exactLocaleAvailable) {
      await Promise.all(baseQueries);
      return;
    }
    await Promise.all([
      ...baseQueries,
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.listRevisions.queryOptions({
          input: { ...scope, scope: "shared", cursor: null, limit: 25 },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.listRevisions.queryOptions({
          input: { ...scope, scope: "localized", cursor: null, limit: 25 },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.publications.status.queryOptions({
          input: scope,
        }),
      ),
      ...(deps.source === "current"
        ? [
            context.queryClient.ensureQueryData(
              context.orpc.platform.projects.collections.entries.preview.current.queryOptions({
                input: scope,
              }),
            ),
          ]
        : isValidRevisionPreviewSearch(deps)
          ? [
              context.queryClient.ensureQueryData(
                context.orpc.platform.projects.collections.entries.preview.revision.queryOptions({
                  input: {
                    ...scope,
                    schemaRevisionId: deps.schemaRevisionId ?? "",
                    sharedRevisionId:
                      deps.sharedRevision === "none" ? null : (deps.sharedRevision ?? null),
                    localizedRevisionId:
                      deps.localizedRevision === "none" ? null : (deps.localizedRevision ?? null),
                  },
                }),
              ),
            ]
          : []),
    ]);
  },
  errorComponent: PreviewRouteError,
  component: EntryPreviewRoute,
});

function PreviewRouteError({ reset }: { readonly reset: () => void }) {
  const params = Route.useParams();
  const search = Route.useSearch();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">Preview could not be loaded</h1>
      <p className="text-muted-foreground">
        Retry the protected request or return to the entry editor and choose another source.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/projects/$projectId/collections/$collectionId/entries/$entryId"
          params={params}
          search={{ locale: search.locale }}
        >
          Back to editor
        </Link>
      </div>
    </main>
  );
}

function EntryPreviewRoute() {
  const { projectId, collectionId, entryId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <EntryPreview
        projectId={projectId}
        collectionId={collectionId}
        entryId={entryId}
        search={search}
        onSearchChange={(nextSearch) => void navigate({ search: nextSearch })}
      />
    </main>
  );
}
