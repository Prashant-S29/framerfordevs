// Routes one exact-locale M7 generated draft editor and validates its locale search context.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { EntryEditor } from "@/components/entry/editor";

export const Route = createFileRoute(
  "/_auth/projects/$projectId_/collections/$collectionId_/entries_/$entryId",
)({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: typeof search.locale === "string" && search.locale.length <= 64 ? search.locale : "",
  }),
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  loader: async ({ context, params, deps }) => {
    const project = await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.get.queryOptions({ input: { projectId: params.projectId } }),
    );
    const locales = await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.locales.list.queryOptions({
        input: { projectId: params.projectId, view: "enabled", includeRemoved: false },
      }),
    );
    const locale =
      locales.data.items.find((item) => item.tag === deps.locale)?.tag ??
      locales.data.items[0]?.tag;
    if (!locale) return;
    const scope = {
      projectId: params.projectId,
      environmentId: project.data.environment.id,
      collectionId: params.collectionId,
    };
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.schema.form.getPublished.queryOptions({
          input: { ...scope, revisionId: null },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.getDraft.queryOptions({
          input: { ...scope, entryId: params.entryId, locale },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.listRevisions.queryOptions({
          input: {
            ...scope,
            entryId: params.entryId,
            locale,
            scope: "shared",
            cursor: null,
            limit: 25,
          },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.listRevisions.queryOptions({
          input: {
            ...scope,
            entryId: params.entryId,
            locale,
            scope: "localized",
            cursor: null,
            limit: 25,
          },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.publications.status.queryOptions({
          input: { ...scope, entryId: params.entryId, locale },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.publications.list.queryOptions({
          input: {
            ...scope,
            entryId: params.entryId,
            locale,
            cursor: null,
            limit: 5,
          },
        }),
      ),
    ]);
  },
  component: EntryEditorRoute,
});

function EntryEditorRoute() {
  const { projectId, collectionId, entryId } = Route.useParams();
  const { locale } = Route.useSearch();
  const navigate = Route.useNavigate();
  const onLocaleChange = useCallback(
    (nextLocale: string, replace = false) => {
      void navigate({ search: { locale: nextLocale }, replace });
    },
    [navigate],
  );
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <EntryEditor
        projectId={projectId}
        collectionId={collectionId}
        entryId={entryId}
        initialLocale={locale}
        onLocaleChange={onLocaleChange}
      />
    </main>
  );
}
