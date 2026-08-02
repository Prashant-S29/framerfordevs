import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Skeleton } from "@framerfordevs/ui/components/skeleton";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, BoxesIcon, CheckIcon, DatabaseIcon } from "lucide-react";
import { toast } from "sonner";

import { ArchiveProjectDialog } from "@/components/archive-project-dialog";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { ProjectAccessSettings } from "@/components/project-access-settings";
import { ProjectCollections } from "@/components/project-collections";
import { ProjectLocaleSettings } from "@/components/project-locale-settings";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/projects/$projectId")({
  component: ProjectDetail,
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const projectQuery = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const accessQuery = useQuery(
    orpc.platform.projects.access.queryOptions({ input: { projectId } }),
  );
  const enableCapability = useMutation(
    orpc.platform.projects.enableCapability.mutationOptions({
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.key(),
        });
        toast.success(response.message);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (projectQuery.isPending || accessQuery.isPending) return <ProjectDetailSkeleton />;
  if (!projectQuery.data || !accessQuery.data) return null;

  const project = projectQuery.data.data;
  const access = accessQuery.data.data;
  const allowedActions = new Set(access.allowedActions);
  const cms = project.capabilities.find((capability) => capability.key === "cms");
  const isArchived = project.archivedAt !== null;
  const canUpdate = allowedActions.has("project.update");
  const canArchive = allowedActions.has("project.archive");
  const canManageCapability = allowedActions.has("project.capability.manage");
  const canReadLocales = allowedActions.has("locale.read");
  const canManageLocales = allowedActions.has("locale.manage");
  const canReadSchemas = allowedActions.has("schema.read");
  const canWriteSchemas = allowedActions.has("schema.write");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-5">
        <Button
          variant="ghost"
          className="self-start"
          render={<Link to="/dashboard" search={{ status: isArchived ? "archived" : "active" }} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to projects
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant={isArchived ? "secondary" : "outline"}>
                {isArchived ? "Archived" : "Active"}
              </Badge>
              <span className="text-muted-foreground text-xs">Version {project.version}</span>
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm" translate="no">
              {project.key}
            </p>
          </div>
          {!isArchived && (canUpdate || canArchive) ? (
            <div className="flex flex-wrap gap-2">
              {canUpdate ? <EditProjectDialog key={project.version} project={project} /> : null}
              {canArchive ? <ArchiveProjectDialog project={project} /> : null}
            </div>
          ) : null}
        </div>
        <p className="text-muted-foreground max-w-3xl text-sm">
          {project.description ?? "No project description has been added."}
        </p>
      </header>

      <Separator />

      <section className="grid gap-4 md:grid-cols-2" aria-label="Project foundations">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Environment</CardTitle>
                <CardDescription>
                  Internal scope for all environment-aware resources.
                </CardDescription>
              </div>
              <DatabaseIcon aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DetailRow label="Key" value={project.environment.key} />
            <DetailRow label="Name" value={project.environment.name} />
            <DetailRow label="Primary" value={project.environment.isPrimary ? "Yes" : "No"} />
            <DetailRow label="Stable ID" value={project.environment.id} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>CMS capability</CardTitle>
                <CardDescription>
                  Enable structured content without changing project type.
                </CardDescription>
              </div>
              <BoxesIcon aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground text-sm">Status</span>
              <Badge variant={cms?.status === "enabled" ? "default" : "secondary"}>
                {cms?.status === "enabled" ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            {cms?.changedAt ? (
              <DetailRow label="Changed" value={dateFormatter.format(new Date(cms.changedAt))} />
            ) : null}
          </CardContent>
          {!isArchived && canManageCapability && cms?.status !== "enabled" ? (
            <CardFooter>
              <Button
                className="w-full"
                disabled={enableCapability.isPending}
                onClick={() => enableCapability.mutate({ projectId, capability: "cms" })}
              >
                {enableCapability.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CheckIcon data-icon="inline-start" />
                )}
                {enableCapability.isPending ? "Enabling…" : "Enable CMS"}
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </section>

      {cms?.status === "enabled" && canReadSchemas ? (
        <ProjectCollections
          projectId={project.id}
          environmentId={project.environment.id}
          canWrite={canWriteSchemas}
          isArchived={isArchived}
        />
      ) : null}

      {canReadLocales ? (
        <ProjectLocaleSettings
          projectId={project.id}
          canManage={canManageLocales}
          isArchived={isArchived}
        />
      ) : null}

      <ProjectAccessSettings
        projectId={project.id}
        environmentId={project.environment.id}
        role={access.role}
        localeAccessMode={access.localeAccess.mode}
        allowedActions={access.allowedActions}
      />

      <Card>
        <CardHeader>
          <CardTitle>Identity and lifecycle</CardTitle>
          <CardDescription>
            Stable identity is immutable and remains reserved after archive.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <DetailRow label="Project ID" value={project.id} mono />
          <DetailRow label="Workspace ID" value={project.workspaceId} mono />
          <DetailRow label="Created" value={dateFormatter.format(new Date(project.createdAt))} />
          <DetailRow label="Updated" value={dateFormatter.format(new Date(project.updatedAt))} />
          {project.archivedAt ? (
            <DetailRow
              label="Archived"
              value={dateFormatter.format(new Date(project.archivedAt))}
            />
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={mono ? "truncate font-mono text-xs" : "text-sm"}
        title={value}
        translate={mono ? "no" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6"
      aria-label="Loading project"
    >
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  );
}
