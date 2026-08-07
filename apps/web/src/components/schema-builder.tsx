import type { EditorLayout } from "@framerfordevs/api/contracts/field-system";
import type {
  CollectionDraftSchema,
  CollectionFieldDefinition,
  SchemaChange,
} from "@framerfordevs/api/contracts/schemas";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import { Field, FieldLabel } from "@framerfordevs/ui/components/field";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GeneratedForm } from "@/components/generated-form";
import { SchemaWorkbench } from "@/components/schema-workbench";
import { orpc } from "@/utils/orpc";

const publishedDateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const classificationLabels = {
  non_breaking: "Non-breaking",
  potentially_breaking: "Potentially breaking",
  breaking: "Breaking",
} as const;

export function SchemaBuilder({
  projectId,
  collectionId,
}: {
  readonly projectId: string;
  readonly collectionId: string;
}) {
  const queryClient = useQueryClient();
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const environmentId = project.data?.data.environment.id;
  const draft = useQuery({
    ...orpc.platform.projects.collections.schema.draft.get.queryOptions({
      input: {
        projectId,
        environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
        collectionId,
      },
    }),
    enabled: Boolean(environmentId),
  });
  const validation = useQuery({
    ...orpc.platform.projects.collections.schema.validate.queryOptions({
      input: {
        projectId,
        environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
        collectionId,
      },
    }),
    enabled: Boolean(environmentId),
  });
  const collections = useQuery({
    ...orpc.platform.projects.collections.list.queryOptions({
      input: {
        projectId,
        environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
        cursor: null,
        limit: 50,
      },
    }),
    enabled: Boolean(environmentId),
  });
  const formDefinition = useQuery({
    ...orpc.platform.projects.collections.schema.form.getDraft.queryOptions({
      input: {
        projectId,
        environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
        collectionId,
      },
    }),
    enabled: Boolean(environmentId),
  });
  const publishedRevisionId = draft.data?.data.collection.currentPublishedRevisionId;
  const published = useQuery({
    ...orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
      input: {
        projectId,
        environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
        collectionId,
        revisionId: publishedRevisionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(environmentId && publishedRevisionId),
  });

  const scope = {
    projectId,
    environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
    collectionId,
  };
  const invalidateSchema = async () => {
    const listKey = orpc.platform.projects.collections.list.queryOptions({
      input: { projectId, environmentId: scope.environmentId, cursor: null, limit: 20 },
    }).queryKey;
    const referenceCollectionsKey = orpc.platform.projects.collections.list.queryOptions({
      input: { projectId, environmentId: scope.environmentId, cursor: null, limit: 50 },
    }).queryKey;
    const draftKey = orpc.platform.projects.collections.schema.draft.get.queryOptions({
      input: scope,
    }).queryKey;
    const validationKey = orpc.platform.projects.collections.schema.validate.queryOptions({
      input: scope,
    }).queryKey;
    const formKey = orpc.platform.projects.collections.schema.form.getDraft.queryOptions({
      input: scope,
    }).queryKey;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: referenceCollectionsKey }),
      queryClient.invalidateQueries({ queryKey: draftKey }),
      queryClient.invalidateQueries({ queryKey: validationKey }),
      queryClient.invalidateQueries({ queryKey: formKey }),
      publishedRevisionId
        ? queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
              input: { ...scope, revisionId: publishedRevisionId },
            }).queryKey,
          })
        : Promise.resolve(),
    ]);
  };
  // Hooks stay above loading/error returns so query hydration cannot change hook order.
  const [authoringDirty, setAuthoringDirty] = useState(false);
  useBlocker({
    disabled: !authoringDirty,
    enableBeforeUnload: authoringDirty,
    shouldBlockFn: () =>
      !globalThis.confirm("Leave this page and discard your unsaved schema changes?"),
  });

  if (
    project.isPending ||
    access.isPending ||
    draft.isPending ||
    validation.isPending ||
    collections.isPending ||
    formDefinition.isPending
  ) {
    return (
      <main className="mx-auto flex min-h-64 w-full max-w-5xl items-center justify-center">
        <Spinner />
        <span className="sr-only">Loading schema builder</span>
      </main>
    );
  }
  if (
    !project.data ||
    !access.data ||
    !draft.data ||
    !validation.data ||
    !collections.data ||
    !formDefinition.data ||
    !environmentId
  )
    return null;

  const projectModel = project.data.data;
  const draftModel = draft.data.data;
  const validationModel = validation.data.data;
  const allowed = new Set(access.data.data.allowedActions);
  const canWrite = allowed.has("schema.write") && projectModel.archivedAt === null;
  const canPublish = allowed.has("schema.publish") && projectModel.archivedAt === null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button
        variant="ghost"
        className="self-start"
        render={<Link to="/projects/$projectId" params={{ projectId }} />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to project
      </Button>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={draftModel.collection.currentPublishedSequence > 0 ? "default" : "secondary"}
          >
            {draftModel.collection.currentPublishedSequence > 0
              ? `Published v${draftModel.collection.currentPublishedSequence}`
              : "Unpublished"}
          </Badge>
          <Badge variant="outline">Draft v{draftModel.collection.draftVersion}</Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {draftModel.collection.displayName}
          </h1>
          <p className="text-muted-foreground font-mono text-sm" translate="no">
            {draftModel.collection.apiKey}
          </p>
        </div>
        <p className="text-muted-foreground max-w-3xl text-sm">
          {draftModel.collection.description ?? "No collection description."}
        </p>
      </header>

      <SchemaWorkbench
        scope={scope}
        draft={draftModel}
        collections={collections.data.data.items}
        canWrite={canWrite}
        onSaved={invalidateSchema}
        onDirtyChange={setAuthoringDirty}
      />

      <EditorLayoutCard
        scope={scope}
        draft={draftModel}
        canWrite={canWrite && !authoringDirty}
        blockedByUnsavedSchema={authoringDirty}
        onSaved={invalidateSchema}
      />
      <SchemaReview validation={validationModel} />
      <Card>
        <CardHeader>
          <CardTitle>Generated form preview</CardTitle>
          <CardDescription>
            Role-projected controls validate locally. Preview values are not persisted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GeneratedForm definition={formDefinition.data.data} />
        </CardContent>
      </Card>
      {published.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-balance">Current published revision</CardTitle>
            <CardDescription>
              Immutable revision {published.data.data.sequence}, published{" "}
              {publishedDateFormatter.format(new Date(published.data.data.publishedAt))}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Fields:</span>{" "}
              {published.data.data.fields.length}
            </p>
            <p>
              <span className="text-muted-foreground">Revision ID:</span>{" "}
              <span className="break-all font-mono text-xs" translate="no">
                {published.data.data.id}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}
      <PublishCard
        scope={scope}
        draft={draftModel}
        changes={validationModel.changes.items}
        valid={validationModel.valid}
        issues={validationModel.issues}
        canPublish={canPublish}
        onPublished={invalidateSchema}
      />
    </main>
  );
}

function EditorLayoutCard({
  scope,
  draft,
  canWrite,
  blockedByUnsavedSchema,
  onSaved,
}: {
  readonly scope: { projectId: string; environmentId: string; collectionId: string };
  readonly draft: CollectionDraftSchema;
  readonly canWrite: boolean;
  readonly blockedByUnsavedSchema: boolean;
  readonly onSaved: () => Promise<void>;
}) {
  const fields = new Map<string, CollectionFieldDefinition>(
    draft.fields.map((field) => [field.id, field]),
  );
  const update = useMutation(
    orpc.platform.projects.collections.schema.layout.update.mutationOptions({
      onSuccess: async (response) => {
        await onSaved();
        toast.success(response.message);
      },
      onError: async (error) => {
        await onSaved();
        toast.error(error.message);
      },
    }),
  );
  const save = (editorLayout: EditorLayout) =>
    update.mutate({
      ...scope,
      draftVersion: draft.collection.draftVersion,
      editorLayout,
    });
  const move = (tabId: string, groupId: string, index: number, direction: -1 | 1) => {
    const target = index + direction;
    const editorLayout: EditorLayout = {
      ...draft.editorLayout,
      tabs: draft.editorLayout.tabs.map((tab) => ({
        ...tab,
        groups: tab.groups.map((group) => {
          if (
            tab.id !== tabId ||
            group.id !== groupId ||
            target < 0 ||
            target >= group.fields.length
          )
            return group;
          const ordered = [...group.fields].sort((left, right) => left.position - right.position);
          const current = ordered[index];
          const other = ordered[target];
          if (!current || !other) return group;
          ordered[index] = other;
          ordered[target] = current;
          return {
            ...group,
            fields: ordered.map((placement, position) => ({ ...placement, position })),
          };
        }),
      })),
    };
    save(editorLayout);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Editor layout</CardTitle>
        <CardDescription>
          {blockedByUnsavedSchema
            ? "Save or discard field changes before editing layout."
            : "Layout order is independent from the content API contract and contract hash."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft.editorLayout.tabs.map((tab) => (
          <section key={tab.id} className="rounded-md border p-3">
            <h3 className="font-medium">{tab.title}</h3>
            {tab.groups.map((group) => {
              const ordered = [...group.fields].sort(
                (left, right) => left.position - right.position,
              );
              return (
                <div key={group.id} className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{group.title}</p>
                    {canWrite ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() =>
                          save({
                            ...draft.editorLayout,
                            tabs: draft.editorLayout.tabs.map((currentTab) => ({
                              ...currentTab,
                              groups: currentTab.groups.map((currentGroup) =>
                                currentGroup.id === group.id
                                  ? {
                                      ...currentGroup,
                                      columns: currentGroup.columns === 1 ? 2 : 1,
                                    }
                                  : currentGroup,
                              ),
                            })),
                          })
                        }
                      >
                        {group.columns} column{group.columns === 1 ? "" : "s"}
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {ordered.map((placement, index) => (
                      <li
                        key={placement.id}
                        className="flex items-center justify-between rounded border px-2 py-1 text-sm"
                      >
                        <span>
                          {fields.get(placement.fieldId)?.displayLabel ?? "Unknown field"}
                        </span>
                        {canWrite ? (
                          <span className="flex gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Move layout field up"
                              disabled={index === 0 || update.isPending}
                              onClick={() => move(tab.id, group.id, index, -1)}
                            >
                              <ArrowUpIcon />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Move layout field down"
                              disabled={index === ordered.length - 1 || update.isPending}
                              onClick={() => move(tab.id, group.id, index, 1)}
                            >
                              <ArrowDownIcon />
                            </Button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function SchemaReview({
  validation,
}: {
  readonly validation: {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<{ path: string; code: string; message: string }>;
    readonly changes: {
      readonly items: ReadonlyArray<SchemaChange>;
      readonly nonBreakingCount: number;
      readonly potentiallyBreakingCount: number;
      readonly breakingCount: number;
    };
  };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation and changes</CardTitle>
        <CardDescription aria-live="polite">
          {validation.valid
            ? "The draft is structurally valid."
            : `${validation.issues.length} validation issue${validation.issues.length === 1 ? "" : "s"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {validation.issues.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {validation.issues.map((issue) => (
              <li key={`${issue.path}-${issue.code}`}>
                <span className="font-mono text-xs">{issue.path}</span>: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{validation.changes.nonBreakingCount} non-breaking</Badge>
          <Badge variant="secondary">
            {validation.changes.potentiallyBreakingCount} potentially breaking
          </Badge>
          <Badge variant={validation.changes.breakingCount > 0 ? "destructive" : "outline"}>
            {validation.changes.breakingCount} breaking
          </Badge>
        </div>
        {validation.changes.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No changes from the current published revision.
          </p>
        ) : (
          <ul className="space-y-2">
            {validation.changes.items.map((change) => (
              <li key={change.changeId} className="rounded-md border p-2 text-sm">
                <Badge variant={change.classification === "breaking" ? "destructive" : "outline"}>
                  {classificationLabels[change.classification]}
                </Badge>
                <span className="ml-2">{change.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PublishCard({
  scope,
  draft,
  changes,
  valid,
  issues,
  canPublish,
  onPublished,
}: {
  readonly scope: { projectId: string; environmentId: string; collectionId: string };
  readonly draft: CollectionDraftSchema;
  readonly changes: ReadonlyArray<SchemaChange>;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<unknown>;
  readonly canPublish: boolean;
  readonly onPublished: () => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState<ReadonlyArray<string>>([]);
  const risky = changes.filter((change) => change.classification !== "non_breaking");
  const publish = useMutation(
    orpc.platform.projects.collections.schema.publish.mutationOptions({
      onSuccess: async (response) => {
        await onPublished();
        setAcknowledged([]);
        toast.success(response.message);
      },
      onError: async (error) => {
        await onPublished();
        toast.error(error.message);
      },
    }),
  );
  const allAcknowledged = risky.every((change) => acknowledged.includes(change.changeId));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish schema</CardTitle>
        <CardDescription>
          Publication snapshots the current draft into an immutable revision and emits a
          transactional event.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        {risky.length > 0 ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Acknowledge every risky change</legend>
            {risky.map((change) => (
              <Field orientation="horizontal" key={change.changeId}>
                <Checkbox
                  id={`ack-${change.changeId}`}
                  checked={acknowledged.includes(change.changeId)}
                  onCheckedChange={(checked) =>
                    setAcknowledged((current) =>
                      checked === true
                        ? [...current, change.changeId]
                        : current.filter((id) => id !== change.changeId),
                    )
                  }
                />
                <FieldLabel htmlFor={`ack-${change.changeId}`}>{change.summary}</FieldLabel>
              </Field>
            ))}
          </fieldset>
        ) : (
          <p className="text-muted-foreground text-sm">No risky changes require acknowledgement.</p>
        )}
        <Button
          className="self-start"
          disabled={
            !canPublish || !valid || issues.length > 0 || !allAcknowledged || publish.isPending
          }
          onClick={() =>
            publish.mutate({
              ...scope,
              draftVersion: draft.collection.draftVersion,
              expectedPublishedRevisionId: draft.collection.currentPublishedRevisionId,
              commandId: crypto.randomUUID(),
              acknowledgedChangeIds: acknowledged,
            })
          }
        >
          {publish.isPending ? <Spinner data-icon="inline-start" /> : null}
          {publish.isPending ? "Publishing…" : "Publish schema"}
        </Button>
        {!canPublish ? (
          <p className="text-muted-foreground text-sm">
            You do not have schema publication permission.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
