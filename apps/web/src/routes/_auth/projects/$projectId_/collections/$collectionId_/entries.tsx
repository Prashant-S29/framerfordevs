// Routes the server-prefetched locale-neutral M7 list using one authorized locale internally.

import { createFileRoute } from "@tanstack/react-router";

import { CollectionEntries } from "@/components/collection-entries";

export const Route = createFileRoute(
  "/_auth/projects/$projectId_/collections/$collectionId_/entries",
)({
  loader: async ({ context, params }) => {
    const project = await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.get.queryOptions({ input: { projectId: params.projectId } }),
    );
    const locales = await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.locales.list.queryOptions({
        input: { projectId: params.projectId, view: "enabled", includeRemoved: false },
      }),
    );
    const scope = {
      projectId: params.projectId,
      environmentId: project.data.environment.id,
      collectionId: params.collectionId,
    };
    const locale = locales.data.items[0]?.tag;
    const [, collectionResult] = await Promise.allSettled([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.access.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.get.queryOptions({ input: scope }),
      ),
    ]);
    if (collectionResult.status === "rejected" || !locale) return;
    const revisionId = collectionResult.value.data.currentPublishedRevisionId;
    if (revisionId === null) return;
    const [formResult] = await Promise.allSettled([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.schema.form.getPublished.queryOptions({
          input: { ...scope, revisionId },
        }),
      ),
    ]);
    if (formResult?.status !== "fulfilled") return;
    await Promise.allSettled([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.entries.list.queryOptions({
          input: { ...scope, locale, cursor: null, limit: 25 },
        }),
      ),
    ]);
  },
  component: CollectionEntriesRoute,
});

function CollectionEntriesRoute() {
  const { projectId, collectionId } = Route.useParams();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <CollectionEntries projectId={projectId} collectionId={collectionId} />
    </main>
  );
}
