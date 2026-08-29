import { createFileRoute } from "@tanstack/react-router";

import { SchemaBuilder } from "@/components/schema-builder";

export const Route = createFileRoute("/_auth/projects/$projectId_/collections/$collectionId")({
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
    await Promise.all([
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.access.queryOptions({
          input: { projectId: params.projectId },
        }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.schema.draft.get.queryOptions({ input: scope }),
      ),
      context.queryClient.ensureQueryData(
        context.orpc.platform.projects.collections.deliveryConfiguration.get.queryOptions({
          input: scope,
        }),
      ),
    ]);
  },
  component: CollectionSchemaRoute,
});

function CollectionSchemaRoute() {
  const { projectId, collectionId } = Route.useParams();
  return <SchemaBuilder projectId={projectId} collectionId={collectionId} />;
}
