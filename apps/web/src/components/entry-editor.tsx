// Renders the generated multilingual M7 draft editor, conflict recovery, and immutable revision restore controls.

import type {
  CollectionFieldDefinition,
  GeneratedFormDefinition,
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, HistoryIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { GeneratedForm } from "@/components/generated-form";
import { LocaleTabs } from "@/components/locale-tabs";
import { entryNameSchema } from "@/lib/cms-validation";
import { applyNewEntryPartitionDefaults } from "@/lib/entry-defaults";
import { fieldMutations } from "@/lib/entry-mutations";
import { client, orpc } from "@/utils/orpc";

function withChildren(
  field: CollectionFieldDefinition,
  children: ReadonlyArray<CollectionFieldDefinition>,
): CollectionFieldDefinition {
  return { ...field, children };
}

function partitionField(
  field: CollectionFieldDefinition,
  scope: "shared" | "localized",
  inherited: "shared" | "localized" | null = null,
): CollectionFieldDefinition | null {
  const effective = inherited ?? field.localization;
  if (effective === scope) return field;
  if (effective !== "mixed" || field.kind !== "object") return null;
  const children = field.children.flatMap((child) => {
    const projected = partitionField(child, scope, null);
    return projected ? [projected] : [];
  });
  return children.length > 0 ? withChildren(field, children) : null;
}

function partitionDefinition(
  definition: GeneratedFormDefinition,
  scope: "shared" | "localized",
  canEdit: boolean,
): GeneratedFormDefinition {
  const fields = definition.fields.flatMap((field) => {
    const projected = partitionField(field, scope);
    return projected ? [projected] : [];
  });
  const visibleIds = new Set<string>();
  const stack = [...fields];
  while (stack.length > 0) {
    const field = stack.pop();
    if (!field) break;
    visibleIds.add(field.id);
    stack.push(...field.children);
  }
  return {
    ...definition,
    canEdit: definition.canEdit && canEdit,
    fields,
    editableFieldIds: definition.editableFieldIds.filter((id) => visibleIds.has(id)),
  };
}

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

type SaveStatus = "saved" | "unsaved" | "saving" | "invalid" | "conflict" | "failed";

function isDraftConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENTRY_DRAFT_CONFLICT"
  );
}

export function EntryEditor({
  projectId,
  collectionId,
  entryId,
  initialLocale,
  onLocaleChange,
}: {
  readonly projectId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly initialLocale: string;
  readonly onLocaleChange: (locale: string, replace?: boolean) => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const locales = useQuery(
    orpc.platform.projects.locales.list.queryOptions({
      input: { projectId, view: "enabled", includeRemoved: false },
    }),
  );
  const environmentId = project.data?.data.environment.id ?? "";
  const localeItems = useMemo(() => locales.data?.data.items ?? [], [locales.data]);
  const selectedLocale =
    localeItems.find((locale) => locale.tag === initialLocale) ?? localeItems[0];
  const localeTag = selectedLocale?.tag ?? "";

  useEffect(() => {
    if (localeTag && localeTag !== initialLocale) onLocaleChange(localeTag, true);
  }, [initialLocale, localeTag, onLocaleChange]);

  const definition = useQuery({
    ...orpc.platform.projects.collections.schema.form.getPublished.queryOptions({
      input: { projectId, environmentId, collectionId, revisionId: null },
    }),
    enabled: Boolean(environmentId),
  });
  const draft = useQuery({
    ...orpc.platform.projects.collections.entries.getDraft.queryOptions({
      input: { projectId, environmentId, collectionId, entryId, locale: localeTag },
    }),
    enabled: Boolean(environmentId && localeTag),
    retry: false,
  });

  if (project.isPending || locales.isPending || definition.isPending || draft.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
        <span className="sr-only">Loading entry editor</span>
      </div>
    );
  }
  if (!project.data || !locales.data || !definition.data) return null;
  if (draft.isError || !draft.data) {
    return (
      <div role="alert" className="rounded-md border border-destructive p-4">
        <p className="font-medium">The entry draft could not be loaded.</p>
        <Button className="mt-3" variant="outline" onClick={() => void draft.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!selectedLocale) return <p role="status">No enabled locale is available.</p>;

  const draftData = draft.data.data;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Button
          variant="ghost"
          className="self-start"
          render={
            <Link
              to="/projects/$projectId/collections/$collectionId/entries"
              params={{ projectId, collectionId }}
            />
          }
        >
          <ArrowLeftIcon data-icon="inline-start" /> Back to entries
        </Button>
        <div>
          <p className="text-muted-foreground font-mono text-xs" translate="no">
            {entryId}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {draftData.entry.displayName ?? `Entry ${entryId}`}
            </h1>
            {definition.data.data.canEdit ? (
              <RenameEntryDialog
                projectId={projectId}
                environmentId={environmentId}
                collectionId={collectionId}
                entryId={entryId}
                locale={localeTag}
                displayName={draftData.entry.displayName ?? `Entry ${entryId}`}
                nameVersion={draftData.entry.nameVersion}
              />
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Shared values are stored once. Localized values belong only to the exact selected
            locale.
          </p>
        </div>
      </header>
      <LocaleTabs
        locales={localeItems}
        selectedLocaleId={selectedLocale.id}
        hasUnsavedChanges={hasUnsavedChanges}
        onSelectedLocaleChange={(localeId) => {
          const next = localeItems.find((item) => item.id === localeId);
          if (next) onLocaleChange(next.tag);
        }}
        renderContent={(tabLocale) =>
          tabLocale.id === selectedLocale.id ? (
            <EntryDraftWorkspace
              key={`${localeTag}-${draftData.sharedRevisionId}-${draftData.localizedRevisionId}-${reloadKey}`}
              projectId={projectId}
              environmentId={environmentId}
              collectionId={collectionId}
              entryId={entryId}
              locale={localeTag}
              definition={definition.data.data}
              draft={draftData}
              onDirtyChange={setHasUnsavedChanges}
              onAuthoritativeReload={async () => {
                await draft.refetch();
                setHasUnsavedChanges(false);
                setReloadKey((current) => current + 1);
              }}
            />
          ) : null
        }
      />
    </div>
  );
}

export function RenameEntryDialog({
  projectId,
  environmentId,
  collectionId,
  entryId,
  locale,
  displayName,
  nameVersion,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly locale: string;
  readonly displayName: string;
  readonly nameVersion: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(displayName);
  const [submitted, setSubmitted] = useState(false);
  const parsed = entryNameSchema.safeParse(value);
  const error = submitted && !parsed.success ? parsed.error.issues[0]?.message : undefined;
  const rename = useMutation({
    mutationFn: (nextDisplayName: string) =>
      client.platform.projects.collections.entries.rename({
        projectId,
        environmentId,
        collectionId,
        entryId,
        locale,
        displayName: nextDisplayName,
        expectedNameVersion: nameVersion,
      }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.getDraft.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.list.key(),
        }),
      ]);
      toast.success(response.message);
      setSubmitted(false);
      setOpen(false);
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (
          !nextOpen &&
          value !== displayName &&
          !globalThis.confirm("Discard this unsaved entry name?")
        )
          return;
        if (nextOpen) setValue(displayName);
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Rename entry" />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename entry</DialogTitle>
          <DialogDescription>
            The management name is shared across locales and is not delivered as content.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (parsed.success) rename.mutate(parsed.data.normalize("NFC"));
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="rename-entry-display-name">Entry name</FieldLabel>
              <Input
                id="rename-entry-display-name"
                name="rename-entry-display-name"
                value={value}
                maxLength={100}
                autoComplete="off"
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setValue(event.target.value);
                  setSubmitted(false);
                }}
              />
              <FieldDescription>Used in entry lists, references, and breadcrumbs.</FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {rename.isPending ? <Spinner data-icon="inline-start" /> : null}
                {rename.isPending ? "Renaming…" : "Rename entry"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EntryDraftWorkspace({
  projectId,
  environmentId,
  collectionId,
  entryId,
  locale,
  definition,
  draft,
  onAuthoritativeReload,
  onDirtyChange,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly locale: string;
  readonly definition: GeneratedFormDefinition;
  readonly draft: {
    readonly entry: {
      readonly displayName: string | null;
      readonly nameVersion: number;
    };
    readonly schemaRevisionId: string;
    readonly contractHash: string;
    readonly sharedVersion: number;
    readonly localizedVersion: number;
    readonly sharedValues: Readonly<Record<string, unknown>>;
    readonly localizedValues: Readonly<Record<string, unknown>>;
    readonly canEditShared: boolean;
    readonly validation: {
      readonly valid: boolean;
      readonly issues: ReadonlyArray<{
        readonly fieldId: string;
        readonly scope: "shared" | "localized";
        readonly message: string;
      }>;
    };
  };
  readonly onAuthoritativeReload: () => Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const sharedDefinition = useMemo(
    () => partitionDefinition(definition, "shared", draft.canEditShared),
    [definition, draft.canEditShared],
  );
  const localizedDefinition = useMemo(
    () => partitionDefinition(definition, "localized", true),
    [definition],
  );
  const [sharedValues, setSharedValues] = useState(() =>
    applyNewEntryPartitionDefaults(
      sharedDefinition.fields,
      draft.sharedValues,
      draft.sharedVersion,
    ),
  );
  const [localizedValues, setLocalizedValues] = useState(() =>
    applyNewEntryPartitionDefaults(
      localizedDefinition.fields,
      draft.localizedValues,
      draft.localizedVersion,
    ),
  );
  const [status, setStatus] = useState<SaveStatus>(draft.validation.valid ? "saved" : "invalid");
  const sharedMutations = fieldMutations(sharedValues, draft.sharedValues, sharedDefinition.fields);
  const localizedMutations = fieldMutations(
    localizedValues,
    draft.localizedValues,
    localizedDefinition.fields,
  );
  const dirty = sharedMutations.length > 0 || localizedMutations.length > 0;
  const issueMap = (scope: "shared" | "localized") =>
    Object.fromEntries(
      draft.validation.issues
        .filter((issue) => issue.scope === scope)
        .map((issue) => [issue.fieldId, issue.message]),
    );

  const save = useMutation({
    mutationFn: () =>
      client.platform.projects.collections.entries.saveDraft({
        projectId,
        environmentId,
        collectionId,
        entryId,
        locale,
        schemaRevisionId: draft.schemaRevisionId,
        contractHash: draft.contractHash,
        commandId: crypto.randomUUID(),
        expectedSharedVersion: draft.sharedVersion,
        expectedLocalizedVersion: draft.localizedVersion,
        sharedMutations: draft.canEditShared ? sharedMutations : [],
        localizedMutations,
      }),
    onMutate: () => setStatus("saving"),
    onSuccess: async (response) => {
      setStatus(response.data.validation.valid ? "saved" : "invalid");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.getDraft.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.list.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.listRevisions.key(),
        }),
      ]);
      toast.success(
        response.data.validation.valid ? "Draft saved." : "Draft saved with validation issues.",
      );
    },
    onError: (error) => {
      setStatus(isDraftConflict(error) ? "conflict" : "failed");
      toast.error(error.message);
    },
  });

  useEffect(() => {
    onDirtyChange(dirty);
    if (dirty && status !== "saving" && status !== "conflict") setStatus("unsaved");
  }, [dirty, onDirtyChange, status]);

  const statusText = {
    saved: "All changes are saved.",
    unsaved: "Unsaved changes.",
    saving: "Saving draft…",
    invalid: "Saved with validation issues.",
    conflict: "Conflict: local edits are preserved. Reload authoritative values before retrying.",
    failed: "Save failed. Local edits are preserved.",
  }[status];

  return (
    <div className="flex flex-col gap-6">
      {status === "conflict" ? (
        <div role="alert" className="rounded-md border border-destructive p-4">
          <p className="font-medium">This draft changed elsewhere.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Your local edits remain on screen. Reload only when you are ready to replace them.
          </p>
          <Button className="mt-3" variant="outline" onClick={() => void onAuthoritativeReload()}>
            <RefreshCwIcon data-icon="inline-start" />
            Reload authoritative draft
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Shared fields</CardTitle>
              <CardDescription>
                Visible in every locale. Shared writes require all-locale authority.
              </CardDescription>
            </div>
            <Badge variant={draft.canEditShared ? "default" : "secondary"}>
              {draft.canEditShared ? "Editable" : "Read only"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {sharedDefinition.fields.length > 0 ? (
            <GeneratedForm
              definition={sharedDefinition}
              values={sharedValues}
              onValuesChange={setSharedValues}
              onSubmit={() => save.mutate()}
              submitLabel="Save draft"
              submitting={save.isPending}
              statusMessage={statusText}
              serverIssues={issueMap("shared")}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              This contract has no role-visible shared fields.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Localized fields — {locale}</CardTitle>
          <CardDescription>No fallback locale is read or written.</CardDescription>
        </CardHeader>
        <CardContent>
          {localizedDefinition.fields.length > 0 ? (
            <GeneratedForm
              definition={localizedDefinition}
              values={localizedValues}
              onValuesChange={setLocalizedValues}
              onSubmit={() => save.mutate()}
              submitLabel="Save draft"
              submitting={save.isPending}
              statusMessage={statusText}
              serverIssues={issueMap("localized")}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              This contract has no role-visible localized fields.
            </p>
          )}
        </CardContent>
      </Card>
      <RevisionHistory
        projectId={projectId}
        environmentId={environmentId}
        collectionId={collectionId}
        entryId={entryId}
        locale={locale}
        draft={draft}
        onRestored={onAuthoritativeReload}
      />
    </div>
  );
}

function RevisionHistory({
  projectId,
  environmentId,
  collectionId,
  entryId,
  locale,
  draft,
  onRestored,
}: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly entryId: string;
  readonly locale: string;
  readonly draft: {
    readonly schemaRevisionId: string;
    readonly contractHash: string;
    readonly sharedVersion: number;
    readonly localizedVersion: number;
    readonly canEditShared: boolean;
  };
  readonly onRestored: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const shared = useQuery(
    orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: {
        projectId,
        environmentId,
        collectionId,
        entryId,
        locale,
        scope: "shared",
        cursor: null,
        limit: 25,
      },
    }),
  );
  const localized = useQuery(
    orpc.platform.projects.collections.entries.listRevisions.queryOptions({
      input: {
        projectId,
        environmentId,
        collectionId,
        entryId,
        locale,
        scope: "localized",
        cursor: null,
        limit: 25,
      },
    }),
  );
  const restore = useMutation({
    mutationFn: ({
      scope,
      revisionId,
    }: {
      readonly scope: "shared" | "localized";
      readonly revisionId: string;
    }) =>
      client.platform.projects.collections.entries.restoreRevision({
        projectId,
        environmentId,
        collectionId,
        entryId,
        locale,
        scope,
        revisionId,
        schemaRevisionId: draft.schemaRevisionId,
        contractHash: draft.contractHash,
        expectedVersion: scope === "shared" ? draft.sharedVersion : draft.localizedVersion,
        commandId: crypto.randomUUID(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.listRevisions.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.platform.projects.collections.entries.list.key(),
        }),
      ]);
      toast.success("Revision restored as a new revision.");
      await onRestored();
    },
    onError: (error) => toast.error(error.message),
  });
  const render = (
    scope: "shared" | "localized",
    items: ReadonlyArray<{
      readonly id: string;
      readonly sequence: number;
      readonly authoredAt: string;
      readonly changedFieldIds: ReadonlyArray<string>;
      readonly restoredFromRevisionId: string | null;
    }>,
  ) => (
    <section aria-labelledby={`${scope}-history`} className="flex flex-col gap-2">
      <h3 id={`${scope}-history`} className="font-medium capitalize">
        {scope} history
      </h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No revisions yet.</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div>
              <p className="text-sm font-medium">
                Revision {item.sequence}
                {item.restoredFromRevisionId ? " · restored" : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                {dateFormatter.format(new Date(item.authoredAt))} · {item.changedFieldIds.length}{" "}
                changed field{item.changedFieldIds.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending || (scope === "shared" && !draft.canEditShared)}
              onClick={() => {
                if (
                  globalThis.confirm(
                    `Restore ${scope} revision ${item.sequence} as a new revision?`,
                  )
                )
                  restore.mutate({ scope, revisionId: item.id });
              }}
            >
              Restore
            </Button>
          </div>
        ))
      )}
    </section>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon aria-hidden="true" />
          Revision history
        </CardTitle>
        <CardDescription>
          Restore appends history; immutable revisions are never overwritten.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {shared.data ? render("shared", shared.data.data.items) : <Spinner />}
        {localized.data ? render("localized", localized.data.data.items) : <Spinner />}
      </CardContent>
    </Card>
  );
}
