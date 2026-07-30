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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@framerfordevs/ui/components/empty";
import { Field, FieldLabel } from "@framerfordevs/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Skeleton } from "@framerfordevs/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@framerfordevs/ui/components/tabs";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { FolderKanbanIcon, MoveRightIcon } from "lucide-react";
import { z } from "zod";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { orpc } from "@/utils/orpc";

const dashboardSearchSchema = z.object({
  workspaceId: z.uuid().optional(),
  status: z.enum(["active", "archived"]).default("active"),
});

export const Route = createFileRoute("/_auth/dashboard")({
  validateSearch: dashboardSearchSchema,
  component: Dashboard,
});

function Dashboard() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const workspaces = useQuery(
    orpc.platform.workspaces.list.queryOptions({ input: { cursor: null, limit: 50 } }),
  );
  const items = workspaces.data?.data.items ?? [];
  const selectedWorkspace =
    items.find((workspace) => workspace.id === search.workspaceId) ?? items[0];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Platform kernel
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Create backend-agnostic projects and enable capabilities as they are needed.
          </p>
        </div>
        <CreateWorkspaceDialog
          onCreated={(workspaceId) =>
            navigate({ search: { workspaceId, status: "active" }, replace: true })
          }
        />
      </header>

      {workspaces.isPending ? <DashboardSkeleton /> : null}

      {!workspaces.isPending && items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanbanIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Create your first workspace</EmptyTitle>
            <EmptyDescription>
              A workspace is the tenant boundary that owns projects and future team membership.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateWorkspaceDialog
              onCreated={(workspaceId) =>
                navigate({ search: { workspaceId, status: "active" }, replace: true })
              }
            />
          </EmptyContent>
        </Empty>
      ) : null}

      {selectedWorkspace ? (
        <section className="flex flex-col gap-6" aria-labelledby="workspace-projects-heading">
          <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
            <Field className="max-w-xs">
              <FieldLabel htmlFor="workspace-selector">Workspace</FieldLabel>
              <NativeSelect
                id="workspace-selector"
                name="workspace-selector"
                className="w-full"
                value={selectedWorkspace.id}
                onChange={(event) =>
                  navigate({
                    search: { workspaceId: event.target.value, status: search.status },
                    replace: true,
                  })
                }
              >
                {items.map((workspace) => (
                  <NativeSelectOption key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {selectedWorkspace.role === "owner" ? (
              <CreateProjectDialog
                workspaceId={selectedWorkspace.id}
                onCreated={(projectId) =>
                  navigate({ to: "/projects/$projectId", params: { projectId } })
                }
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="workspace-projects-heading" className="font-medium">
                {selectedWorkspace.name}
              </h2>
              <p className="text-muted-foreground text-sm">
                {selectedWorkspace.role === "owner" ? "Owner access" : "Collaborator access"}
              </p>
            </div>
            <Tabs
              value={search.status}
              onValueChange={(value) => {
                if (value === "active" || value === "archived") {
                  navigate({
                    search: { workspaceId: selectedWorkspace.id, status: value },
                    replace: true,
                  });
                }
              }}
            >
              <TabsList aria-label="Project state">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="archived">Archived</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ProjectList workspaceId={selectedWorkspace.id} status={search.status} />
        </section>
      ) : null}
    </main>
  );
}

function ProjectList({
  workspaceId,
  status,
}: {
  readonly workspaceId: string;
  readonly status: "active" | "archived";
}) {
  const projects = useInfiniteQuery(
    orpc.platform.projects.list.infiniteOptions({
      input: (cursor: string | null) => ({ workspaceId, status, cursor, limit: 12 }),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
      maxPages: 10,
    }),
  );
  const items = projects.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (projects.isPending) return <ProjectListSkeleton />;

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderKanbanIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No {status} projects</EmptyTitle>
          <EmptyDescription>
            {status === "active"
              ? "Create a project to establish its stable identity and main environment."
              : "Archived projects will remain here with their related state preserved."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{project.name}</CardTitle>
                  <CardDescription className="font-mono" translate="no">
                    {project.key}
                  </CardDescription>
                </div>
                <Badge variant={project.archivedAt ? "secondary" : "outline"}>
                  {project.archivedAt ? "Archived" : "Active"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
                {project.description ?? "No description"}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
              >
                View project
                <MoveRightIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {projects.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={projects.isFetchingNextPage}
          onClick={() => void projects.fetchNextPage()}
        >
          {projects.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading workspaces">
      <Skeleton className="h-14 w-full" />
      <ProjectListSkeleton />
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading projects">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-48 w-full" />
      ))}
    </div>
  );
}
