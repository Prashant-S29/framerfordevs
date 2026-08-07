import type {
  CollectionDraftSchema,
  CollectionFieldKind,
} from "@framerfordevs/api/contracts/schemas";
import { Alert, AlertDescription, AlertTitle } from "@framerfordevs/ui/components/alert";
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
  FieldLabel,
} from "@framerfordevs/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@framerfordevs/ui/components/tabs";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BracesIcon,
  ChevronRightIcon,
  FileJsonIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SchemaFieldInspector } from "@/components/schema-field-inspector";
import {
  applicationErrorDetails,
  appendEditorField,
  authoringDocument,
  createSchemaField,
  editorFieldPath,
  fieldKindLabel,
  fieldKindOptions,
  fieldsFromDraft,
  findEditorField,
  findEditorFieldParent,
  inferAuthoringDocument,
  moveEditorField,
  normalizeEditorFieldTree,
  parseAuthoringDocument,
  removeEditorField,
  siblingApiKeyConflict,
  stringifyAuthoringDocument,
  updateEditorField,
  validateEditorFields,
  type SchemaEditorField,
  type SchemaEditorIssue,
} from "@/lib/schema-authoring";
import { orpc } from "@/utils/orpc";

interface SchemaScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
}

interface SchemaWorkbenchProps {
  readonly scope: SchemaScope;
  readonly draft: CollectionDraftSchema;
  readonly collections: ReadonlyArray<{ readonly id: string; readonly displayName: string }>;
  readonly canWrite: boolean;
  readonly onSaved: () => Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
}

function nextSiblingKey(
  siblings: ReadonlyArray<SchemaEditorField>,
  base = "untitled_field",
): string {
  const keys = new Set(siblings.flatMap((field) => (field.apiKey ? [field.apiKey] : [])));
  if (!keys.has(base)) return base;
  let suffix = 2;
  while (keys.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function TreeNode({
  field,
  siblings,
  depth,
  selectedId,
  canWrite,
  onSelect,
  onAddChild,
  onMove,
}: {
  readonly field: SchemaEditorField;
  readonly siblings: ReadonlyArray<SchemaEditorField>;
  readonly depth: number;
  readonly selectedId: string | null;
  readonly canWrite: boolean;
  readonly onSelect: (localId: string) => void;
  readonly onAddChild: (parent: SchemaEditorField) => void;
  readonly onMove: (localId: string, direction: -1 | 1) => void;
}) {
  const index = siblings.findIndex((candidate) => candidate.localId === field.localId);
  const canAddChild =
    field.kind === "object" || (field.kind === "list" && field.children.length === 0);
  return (
    <li className={depth > 0 ? "ml-4 border-l pl-3" : undefined}>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="hover:bg-muted focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
          aria-current={selectedId === field.localId ? "true" : undefined}
          onClick={() => onSelect(field.localId)}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={field.children.length === 0 ? "opacity-0" : undefined}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {field.displayLabel ?? "List Item"}
            </span>
            <span className="text-muted-foreground block truncate font-mono text-xs" translate="no">
              {field.apiKey ?? "item"}
            </span>
          </span>
          <Badge variant={selectedId === field.localId ? "default" : "outline"}>
            {fieldKindLabel(field.kind)}
          </Badge>
        </button>
        {canWrite ? (
          <div className="flex shrink-0 gap-0.5">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${field.displayLabel ?? "list item"} up`}
              disabled={index <= 0}
              onClick={() => onMove(field.localId, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${field.displayLabel ?? "list item"} down`}
              disabled={index < 0 || index === siblings.length - 1}
              onClick={() => onMove(field.localId, 1)}
            >
              <ArrowDownIcon />
            </Button>
            {canAddChild ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Add child to ${field.displayLabel ?? "list"}`}
                onClick={() => onAddChild(field)}
              >
                <PlusIcon />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {field.children.length > 0 ? (
        <ul className="flex flex-col gap-1 pt-1">
          {field.children.map((child) => (
            <TreeNode
              key={child.localId}
              field={child}
              siblings={field.children}
              depth={depth + 1}
              selectedId={selectedId}
              canWrite={canWrite}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onMove={onMove}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function IssueSummary({ issues }: { readonly issues: ReadonlyArray<SchemaEditorIssue> }) {
  if (issues.length === 0) return null;
  return (
    <Alert variant="destructive" aria-live="polite">
      <AlertTitle>
        Fix {issues.length} schema issue{issues.length === 1 ? "" : "s"}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.code}`} className="break-words">
              <span className="font-mono" translate="no">
                {issue.path}
              </span>
              : {issue.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function SampleJsonDialog({
  collectionId,
  onApply,
}: {
  readonly collectionId: string;
  readonly onApply: (fields: ReadonlyArray<SchemaEditorField>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('{\n  "title": "Hello world"\n}');
  const deferredSource = useDeferredValue(source);
  const inferred = useMemo(
    () => inferAuthoringDocument(deferredSource, collectionId),
    [collectionId, deferredSource],
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <WandSparklesIcon data-icon="inline-start" />
        Infer From Sample
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Infer Fields From Sample JSON</DialogTitle>
          <DialogDescription>
            Paste representative content. Values stay in your browser and are never saved; only the
            inferred field definitions can replace the unsaved draft.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={!inferred.valid}>
          <FieldLabel htmlFor="sample-json">Sample JSON</FieldLabel>
          <Textarea
            id="sample-json"
            name="sample-json"
            value={source}
            rows={14}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!inferred.valid}
            onChange={(event) => setSource(event.target.value)}
          />
          <FieldDescription>Use a top-level object up to 1 MiB.</FieldDescription>
          <FieldError>{inferred.issues[0]?.message}</FieldError>
        </Field>
        {inferred.warnings.length > 0 ? (
          <Alert>
            <AlertTitle>Review Inference Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {inferred.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        {inferred.valid ? (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Inferred Preview</p>
            <ul className="flex flex-col gap-1 text-sm">
              {inferred.fields.map((field) => (
                <li key={field.localId} className="flex items-center justify-between gap-3">
                  <span className="truncate">{field.displayLabel}</span>
                  <Badge variant="outline">{fieldKindLabel(field.kind)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button type="button" disabled={!inferred.valid} />}>
              Use Inferred Fields
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace the unsaved field draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  This replaces every field in the local builder. The server draft does not change
                  until you select Save Schema.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Current Draft</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onApply(inferred.fields);
                    setOpen(false);
                  }}
                >
                  Replace Local Draft
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SchemaWorkbench({
  scope,
  draft,
  collections,
  canWrite,
  onSaved,
  onDirtyChange,
}: SchemaWorkbenchProps) {
  const [initialFields] = useState(() => fieldsFromDraft(draft));
  const [fields, setFields] = useState<ReadonlyArray<SchemaEditorField>>(initialFields);
  const [selectedId, setSelectedId] = useState<string | null>(initialFields[0]?.localId ?? null);
  const [mode, setMode] = useState("visual");
  const [newKind, setNewKind] = useState<CollectionFieldKind>("short_text");
  const [jsonSource, setJsonSource] = useState(() => stringifyAuthoringDocument(initialFields));
  const deferredJsonSource = useDeferredValue(jsonSource);
  const jsonIssues = useMemo(
    () => parseAuthoringDocument(deferredJsonSource).issues,
    [deferredJsonSource],
  );
  const [serverIssues, setServerIssues] = useState<ReadonlyArray<SchemaEditorIssue>>([]);
  const [dirty, setDirty] = useState(false);
  const [appliedDraftVersion, setAppliedDraftVersion] = useState(draft.collection.draftVersion);
  const localIssues = validateEditorFields(fields);
  const allIssues = [...localIssues, ...serverIssues];
  const selected = selectedId ? findEditorField(fields, selectedId) : undefined;
  const parent = selectedId ? findEditorFieldParent(fields, selectedId) : undefined;
  const selectedPath = selectedId ? editorFieldPath(fields, selectedId) : undefined;
  const selectedIssues = selected
    ? allIssues.filter(
        (issue) =>
          (selectedPath !== undefined && issue.path.startsWith(selectedPath)) ||
          (selected.id !== null && issue.path.includes(selected.id)),
      )
    : [];

  useEffect(() => {
    if (dirty || draft.collection.draftVersion <= appliedDraftVersion) return;
    const next = fieldsFromDraft(draft);
    setFields(next);
    setSelectedId(next[0]?.localId ?? null);
    setJsonSource(stringifyAuthoringDocument(next));
    setServerIssues([]);
    setAppliedDraftVersion(draft.collection.draftVersion);
  }, [appliedDraftVersion, dirty, draft]);

  const setDirtyState = (next: boolean) => {
    setDirty(next);
    onDirtyChange(next);
  };
  const replaceLocalFields = (next: ReadonlyArray<SchemaEditorField>) => {
    setFields(next);
    setSelectedId(next[0]?.localId ?? null);
    setServerIssues([]);
    setDirtyState(true);
  };
  const save = useMutation(
    orpc.platform.projects.collections.schema.fields.replace.mutationOptions({
      onSuccess: async (response) => {
        const next = fieldsFromDraft(response.data);
        setFields(next);
        setSelectedId(next[0]?.localId ?? null);
        setJsonSource(stringifyAuthoringDocument(next));
        setServerIssues([]);
        setAppliedDraftVersion(response.data.collection.draftVersion);
        setDirtyState(false);
        await onSaved();
        toast.success(response.message);
      },
      onError: (error) => {
        const details = applicationErrorDetails(error);
        setServerIssues(details);
        toast.error(details[0]?.message ?? error.message);
      },
    }),
  );
  const saveSchema = () => {
    const issues = validateEditorFields(fields);
    if (issues.length > 0) {
      setServerIssues([]);
      const first = issues[0];
      toast.error(first ? first.message : "Fix the schema issues before saving.");
      return;
    }
    const document = authoringDocument(fields);
    save.mutate({
      ...scope,
      draftVersion: draft.collection.draftVersion,
      authoringVersion: document.version,
      fields: document.fields,
    });
  };
  const discard = () => {
    if (dirty && !globalThis.confirm("Discard all unsaved schema changes?")) return;
    const next = fieldsFromDraft(draft);
    setFields(next);
    setSelectedId(next[0]?.localId ?? null);
    setJsonSource(stringifyAuthoringDocument(next));
    setServerIssues([]);
    setAppliedDraftVersion(draft.collection.draftVersion);
    setDirtyState(false);
  };
  const addRoot = () => {
    const field = createSchemaField({
      kind: newKind,
      collectionId: scope.collectionId,
      suggestedLabel: "Untitled Field",
      suggestedKey: nextSiblingKey(fields),
    });
    setFields((current) => [...current, field]);
    setSelectedId(field.localId);
    setDirtyState(true);
  };
  const addChild = (parentField: SchemaEditorField) => {
    const listItem = parentField.kind === "list";
    const field = createSchemaField({
      kind: "short_text",
      collectionId: scope.collectionId,
      parent: parentField,
      ...(listItem
        ? {}
        : {
            suggestedLabel: "Untitled Field",
            suggestedKey: nextSiblingKey(parentField.children),
          }),
    });
    setFields((current) => appendEditorField(current, field, parentField.localId));
    setSelectedId(field.localId);
    setDirtyState(true);
  };
  const applySchemaJson = () => {
    const parsed = parseAuthoringDocument(jsonSource);
    if (!parsed.valid) return;
    replaceLocalFields(parsed.fields);
    setMode("visual");
    toast.success("Schema JSON applied to the local draft.");
  };

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Schema Builder</CardTitle>
            <CardDescription>
              Build visually, edit the same field schema as JSON, or infer a starting point from
              sample content.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <Badge variant="secondary">Unsaved Changes</Badge>
            ) : (
              <Badge variant="outline">Saved</Badge>
            )}
            {canWrite ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!dirty || save.isPending}
                  onClick={discard}
                >
                  <Undo2Icon data-icon="inline-start" />
                  Discard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || save.isPending || localIssues.length > 0}
                  onClick={saveSchema}
                >
                  {save.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SaveIcon data-icon="inline-start" />
                  )}
                  {save.isPending ? "Saving…" : "Save Schema"}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <IssueSummary issues={allIssues} />
      </CardHeader>
      <CardContent>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (value === "json") setJsonSource(stringifyAuthoringDocument(fields));
            setMode(value);
          }}
        >
          <TabsList variant="line" aria-label="Schema editor view">
            <TabsTrigger value="visual">
              <BracesIcon data-icon="inline-start" />
              Visual Builder
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJsonIcon data-icon="inline-start" />
              Schema JSON
            </TabsTrigger>
          </TabsList>
          <TabsContent value="visual" className="pt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
              <section aria-labelledby="field-tree-title" className="min-w-0 rounded-md border p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 id="field-tree-title" className="text-sm font-semibold">
                      Field Tree
                    </h2>
                    <p className="text-muted-foreground text-xs">
                      Select a field to edit it in the inspector.
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex items-end gap-2">
                      <Field>
                        <FieldLabel htmlFor="new-field-kind" className="sr-only">
                          New Field Type
                        </FieldLabel>
                        <NativeSelect
                          id="new-field-kind"
                          name="new-field-kind"
                          value={newKind}
                          onChange={(event) => {
                            const option = fieldKindOptions.find(
                              ([kind]) => kind === event.target.value,
                            );
                            if (option) setNewKind(option[0]);
                          }}
                        >
                          {fieldKindOptions.map(([value, label]) => (
                            <NativeSelectOption key={value} value={value}>
                              {label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Button type="button" size="sm" onClick={addRoot}>
                        <PlusIcon data-icon="inline-start" />
                        Add Field
                      </Button>
                    </div>
                  ) : null}
                </div>
                {fields.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No Fields Yet</EmptyTitle>
                      <EmptyDescription>
                        Add a field or infer a schema from sample JSON.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {fields.map((field) => (
                      <TreeNode
                        key={field.localId}
                        field={field}
                        siblings={fields}
                        depth={0}
                        selectedId={selectedId}
                        canWrite={canWrite}
                        onSelect={setSelectedId}
                        onAddChild={addChild}
                        onMove={(localId, direction) => {
                          setFields((current) => moveEditorField(current, localId, direction));
                          setDirtyState(true);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
              <section
                aria-labelledby="field-inspector-title"
                className="min-w-0 rounded-md border p-4"
              >
                {selected ? (
                  <>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 id="field-inspector-title" className="truncate text-sm font-semibold">
                          {selected.displayLabel ?? "List Item"}
                        </h2>
                        <p className="text-muted-foreground font-mono text-xs" translate="no">
                          {selected.id ?? "New field — ID assigned on save"}
                        </p>
                      </div>
                      {canWrite ? (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Remove ${selected.displayLabel ?? "list item"}`}
                              />
                            }
                          >
                            <Trash2Icon />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove {selected.displayLabel ?? "this list item"}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Nested fields are removed with it. Published history stays
                                immutable, and the server draft changes only after Save Schema.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep Field</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  const next = removeEditorField(fields, selected.localId);
                                  setFields(next);
                                  setSelectedId(next[0]?.localId ?? null);
                                  setDirtyState(true);
                                }}
                              >
                                Remove Field
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </div>
                    <SchemaFieldInspector
                      key={selected.localId}
                      field={selected}
                      parent={parent}
                      collectionId={scope.collectionId}
                      collections={collections}
                      apiKeyConflict={siblingApiKeyConflict(
                        fields,
                        selected.localId,
                        selected.apiKey,
                      )}
                      issues={selectedIssues}
                      onChange={(field) => {
                        const normalized = normalizeEditorFieldTree(field);
                        setFields((current) =>
                          updateEditorField(current, field.localId, () => normalized),
                        );
                        setDirtyState(true);
                        setServerIssues([]);
                      }}
                    />
                  </>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle id="field-inspector-title">Select a Field</EmptyTitle>
                      <EmptyDescription>
                        Choose a field in the tree to edit its settings.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="json" className="pt-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Field Schema JSON</h2>
                  <p className="text-muted-foreground text-xs">
                    Versioned authoring JSON omits derived parents, positions, hashes, and layout.
                  </p>
                </div>
                <SampleJsonDialog
                  collectionId={scope.collectionId}
                  onApply={(next) => {
                    replaceLocalFields(next);
                    setJsonSource(stringifyAuthoringDocument(next));
                    setMode("visual");
                  }}
                />
              </div>
              <Field data-invalid={jsonIssues.length > 0}>
                <FieldLabel htmlFor="schema-json">Schema JSON</FieldLabel>
                <Textarea
                  id="schema-json"
                  name="schema-json"
                  value={jsonSource}
                  rows={28}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={jsonIssues.length > 0}
                  className="font-mono text-xs"
                  onChange={(event) => setJsonSource(event.target.value)}
                />
                <FieldDescription>
                  Use null IDs for new fields. Existing active IDs preserve stable identity.
                </FieldDescription>
                <FieldError>
                  {jsonIssues[0] ? `${jsonIssues[0].path}: ${jsonIssues[0].message}` : undefined}
                </FieldError>
              </Field>
              {jsonIssues.length > 1 ? <IssueSummary issues={jsonIssues} /> : null}
              <Button
                type="button"
                className="self-start"
                disabled={!canWrite || jsonIssues.length > 0}
                onClick={applySchemaJson}
              >
                Apply JSON to Visual Draft
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
