import type {
  CollectionDraftSchema,
  CollectionFieldDefinition,
  SchemaChange,
} from "@framerfordevs/api/contracts/schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@framerfordevs/ui/components/alert-dialog";
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
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cmsKeyFromName, fieldFormSchema } from "@/lib/cms-validation";
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

function fieldError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

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

  if (project.isPending || access.isPending || draft.isPending || validation.isPending) {
    return (
      <main className="mx-auto flex min-h-64 w-full max-w-5xl items-center justify-center">
        <Spinner />
        <span className="sr-only">Loading schema builder</span>
      </main>
    );
  }
  if (!project.data || !access.data || !draft.data || !validation.data || !environmentId)
    return null;

  const projectModel = project.data.data;
  const draftModel = draft.data.data;
  const validationModel = validation.data.data;
  const allowed = new Set(access.data.data.allowedActions);
  const canWrite = allowed.has("schema.write") && projectModel.archivedAt === null;
  const canPublish = allowed.has("schema.publish") && projectModel.archivedAt === null;
  const scope = { projectId, environmentId, collectionId };
  const invalidateSchema = async () => {
    const listKey = orpc.platform.projects.collections.list.queryOptions({
      input: { projectId, environmentId, cursor: null, limit: 20 },
    }).queryKey;
    const draftKey = orpc.platform.projects.collections.schema.draft.get.queryOptions({
      input: scope,
    }).queryKey;
    const validationKey = orpc.platform.projects.collections.schema.validate.queryOptions({
      input: scope,
    }).queryKey;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: draftKey }),
      queryClient.invalidateQueries({ queryKey: validationKey }),
      publishedRevisionId
        ? queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
              input: { ...scope, revisionId: publishedRevisionId },
            }).queryKey,
          })
        : Promise.resolve(),
    ]);
  };
  const reorder = useMutation(
    orpc.platform.projects.collections.schema.fields.reorder.mutationOptions({
      onSuccess: async (response) => {
        await invalidateSchema();
        toast.success(response.message);
      },
      onError: async (error) => {
        await invalidateSchema();
        toast.error(error.message);
      },
    }),
  );

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftModel.fields.length) return;
    const ids = draftModel.fields.map((field) => field.id);
    const current = ids[index];
    const other = ids[target];
    if (!current || !other) return;
    ids[index] = other;
    ids[target] = current;
    reorder.mutate({ ...scope, draftVersion: draftModel.collection.draftVersion, fieldIds: ids });
  };

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

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Draft fields</CardTitle>
            <CardDescription>
              Stable IDs survive label, key, type, and order changes. Draft edits do not affect
              published revisions.
            </CardDescription>
          </div>
          {canWrite ? (
            <FieldDialog scope={scope} draft={draftModel} onSaved={invalidateSchema} />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {draftModel.fields.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No fields yet</EmptyTitle>
                <EmptyDescription>Add at least one field before publishing.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            draftModel.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border p-3 [contain-intrinsic-size:auto_88px] [content-visibility:auto] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{field.displayLabel}</p>
                    {field.required ? <Badge variant="outline">Required</Badge> : null}
                    {field.deprecated ? <Badge variant="secondary">Deprecated</Badge> : null}
                  </div>
                  <p className="text-muted-foreground truncate font-mono text-xs" translate="no">
                    {field.apiKey}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {field.kind.replace("_", " ")} · {field.localization} · position{" "}
                    {field.position + 1}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${field.displayLabel} up`}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${field.displayLabel} down`}
                      disabled={index === draftModel.fields.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <FieldDialog
                      scope={scope}
                      draft={draftModel}
                      field={field}
                      onSaved={invalidateSchema}
                    />
                    <RemoveFieldDialog
                      scope={scope}
                      draft={draftModel}
                      field={field}
                      onRemoved={invalidateSchema}
                    />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <SchemaReview validation={validationModel} />
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

export function FieldDialog({
  scope,
  draft,
  field,
  onSaved,
}: {
  readonly scope: { projectId: string; environmentId: string; collectionId: string };
  readonly draft: CollectionDraftSchema;
  readonly field?: CollectionFieldDefinition;
  readonly onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [keyEdited, setKeyEdited] = useState(Boolean(field));
  const mutationCallbacks = {
    onSuccess: async (response: { readonly message: string }) => {
      await onSaved();
      toast.success(response.message);
      form.reset();
      setOpen(false);
    },
    onError: async (error: Error) => {
      await onSaved();
      toast.error(error.message);
    },
  };
  const create = useMutation(
    orpc.platform.projects.collections.schema.fields.create.mutationOptions(mutationCallbacks),
  );
  const update = useMutation(
    orpc.platform.projects.collections.schema.fields.update.mutationOptions(mutationCallbacks),
  );
  const isPending = create.isPending || update.isPending;
  const form = useForm({
    defaultValues: {
      displayLabel: field?.displayLabel ?? "",
      apiKey: field?.apiKey ?? "",
      kind: field?.kind ?? "short_text",
      localization: field?.localization ?? "localized",
      required: field?.required ?? false,
      deprecated: field?.deprecated ?? false,
    },
    validators: { onSubmit: fieldFormSchema },
    onSubmit: ({ value }) => {
      const definition = {
        ...scope,
        draftVersion: draft.collection.draftVersion,
        displayLabel: value.displayLabel.trim().normalize("NFC"),
        apiKey: value.apiKey.trim(),
        kind: value.kind,
        localization: value.localization,
        required: value.required,
        deprecated: value.deprecated,
        configuration: {},
      };
      if (field) {
        update.mutate({ ...definition, fieldId: field.id });
      } else {
        create.mutate(definition);
      }
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (
          !nextOpen &&
          form.state.isDirty &&
          !globalThis.confirm("Discard your unsaved field changes?")
        ) {
          return;
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger
        render={
          <Button
            size={field ? "icon-sm" : "sm"}
            variant={field ? "ghost" : "default"}
            aria-label={field ? `Edit ${field.displayLabel}` : undefined}
          />
        }
      >
        {field ? (
          <PencilIcon />
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            Add field
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? "Edit field" : "Add field"}</DialogTitle>
          <DialogDescription>
            {field
              ? "The stable field ID remains unchanged."
              : "A stable field ID is generated by the server."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="displayLabel">
              {(item) => {
                const message = fieldError(item.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={item.name}>Display label</FieldLabel>
                    <Input
                      id={item.name}
                      name={item.name}
                      value={item.state.value}
                      maxLength={100}
                      autoComplete="off"
                      onChange={(event) => {
                        const value = event.target.value;
                        item.handleChange(value);
                        if (!keyEdited) form.setFieldValue("apiKey", cmsKeyFromName(value));
                      }}
                    />
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="apiKey">
              {(item) => {
                const message = fieldError(item.state.meta.errors[0]);
                return (
                  <Field data-invalid={Boolean(message)}>
                    <FieldLabel htmlFor={item.name}>API key</FieldLabel>
                    <Input
                      id={item.name}
                      name={item.name}
                      value={item.state.value}
                      maxLength={63}
                      spellCheck={false}
                      autoComplete="off"
                      translate="no"
                      onChange={(event) => {
                        setKeyEdited(true);
                        item.handleChange(event.target.value.toLowerCase());
                      }}
                    />
                    <FieldDescription>Renaming a published key is breaking.</FieldDescription>
                    <FieldError>{message}</FieldError>
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="kind">
              {(item) => (
                <Field>
                  <FieldLabel htmlFor={item.name}>Field type</FieldLabel>
                  <NativeSelect
                    id={item.name}
                    name={item.name}
                    value={item.state.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "short_text" || value === "number" || value === "boolean") {
                        item.handleChange(value);
                      }
                    }}
                  >
                    <NativeSelectOption value="short_text">Short text</NativeSelectOption>
                    <NativeSelectOption value="number">Number</NativeSelectOption>
                    <NativeSelectOption value="boolean">Boolean</NativeSelectOption>
                  </NativeSelect>
                </Field>
              )}
            </form.Field>
            <form.Field name="localization">
              {(item) => (
                <Field>
                  <FieldLabel htmlFor={item.name}>Localization</FieldLabel>
                  <NativeSelect
                    id={item.name}
                    name={item.name}
                    value={item.state.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "localized" || value === "shared") item.handleChange(value);
                    }}
                  >
                    <NativeSelectOption value="localized">Localized</NativeSelectOption>
                    <NativeSelectOption value="shared">Shared</NativeSelectOption>
                  </NativeSelect>
                </Field>
              )}
            </form.Field>
            <form.Field name="required">
              {(item) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={item.name}
                    name={item.name}
                    checked={item.state.value}
                    onCheckedChange={(checked) => item.handleChange(checked === true)}
                  />
                  <FieldLabel htmlFor={item.name}>Required</FieldLabel>
                </Field>
              )}
            </form.Field>
            <form.Field name="deprecated">
              {(item) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={item.name}
                    name={item.name}
                    checked={item.state.value}
                    onCheckedChange={(checked) => item.handleChange(checked === true)}
                  />
                  <FieldLabel htmlFor={item.name}>Deprecated</FieldLabel>
                </Field>
              )}
            </form.Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Spinner data-icon="inline-start" /> : null}
                {isPending ? "Saving…" : "Save field"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveFieldDialog({
  scope,
  draft,
  field,
  onRemoved,
}: {
  readonly scope: { projectId: string; environmentId: string; collectionId: string };
  readonly draft: CollectionDraftSchema;
  readonly field: CollectionFieldDefinition;
  readonly onRemoved: () => Promise<void>;
}) {
  const remove = useMutation(
    orpc.platform.projects.collections.schema.fields.remove.mutationOptions({
      onSuccess: async (response) => {
        await onRemoved();
        toast.success(response.message);
      },
      onError: async (error) => {
        await onRemoved();
        toast.error(error.message);
      },
    }),
  );
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${field.displayLabel}`} />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {field.displayLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            The stable identity remains in publication history. Removing a published field is a
            breaking change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate({
                ...scope,
                fieldId: field.id,
                draftVersion: draft.collection.draftVersion,
              })
            }
          >
            {remove.isPending ? "Removing…" : "Remove field"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
