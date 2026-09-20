import { createFileRoute } from "@tanstack/react-router";

import { PresentationEditor } from "@/components/presentation-editor";

export const Route = createFileRoute(
  "/_auth/projects/$projectId_/collections/$collectionId_/presentation",
)({
  loader: async ({ context, params }) => {
    const project = await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.get.queryOptions({
        input: { projectId: params.projectId },
      }),
    );
    const scope = {
      projectId: params.projectId,
      environmentId: project.data.environment.id,
      collectionId: params.collectionId,
    };
    const [, presentation] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.access.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.schema.presentation.get.queryOptions({
          input: scope,
        }),
      ),
    ]);
    await context.queryClient.ensureQueryData(
      context.orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
        input: { ...scope, revisionId: presentation.data.revision.revisionId },
      }),
    );
  },
  component: CollectionPresentationRoute,
});

function CollectionPresentationRoute() {
  const { projectId, collectionId } = Route.useParams();
  return <PresentationEditor projectId={projectId} collectionId={collectionId} />;
}
