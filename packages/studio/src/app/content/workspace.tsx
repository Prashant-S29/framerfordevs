import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ContentForm,
  applyGeneratedFormDefaults,
  fieldMutations,
  partitionContentFormDefinition,
  type ContentDraftMutation,
  type ContentFormDefinition,
  type ContentFormServerIssue,
  type ContentReferencePickerProps,
} from "@framerfordevs/content-form";
import { Button } from "@framerfordevs/ui/components/button";
import { Input } from "@framerfordevs/ui/components/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@framerfordevs/ui/components/alert/dialog";

import { StudioContentClientError } from "../../content-client";
import { useStudioRuntime } from "../shell";
import type {
  StudioEntryWorkspaceDto,
  StudioJsonObject,
  StudioJsonValue,
  StudioNewEntryWorkspaceDto,
  StudioRevisionSummaryDto,
  StudioValidationDto,
} from "../../contracts/content";
import {
  contentErrorMessage,
  contentQueryKeys,
  contentRetryDelay,
  retryContentQuery,
  useContentRetryCountdown,
  useStudioContentClient,
  useStudioContentContext,
} from "./data";
import { adaptStudioContentForm } from "./form-adapter";
import {
  keepStudioUnresolvedChange,
  rebaseStudioValues,
  validateStudioValues,
  type StudioRebaseResult,
  type StudioUnresolvedChange,
} from "./rebase";
import { StudioReferencePicker, StudioReferenceResolutionProvider } from "./reference-picker";
import { StudioHistoryPanel } from "./history/panel";
import { StudioPublicationBadge } from "./publication/badge";
import { StudioPublicationPanel } from "./publication/panel";
import { StudioPreviewPanel, studioPreviewEnabled, type StudioPreviewSelection } from "./preview";

type WorkspaceMode = "new" | "entry";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeValues(
  shared: Readonly<Record<string, StudioJsonValue>>,
  localized: Readonly<Record<string, StudioJsonValue>>,
): Readonly<Record<string, unknown>> {
  const mergeItem = (left: unknown, right: unknown): unknown => {
    if (!isRecord(left) || !isRecord(right)) return right;
    const nested: Record<string, unknown> = Object.fromEntries(Object.entries(left));
    for (const [key, item] of Object.entries(right)) {
      Reflect.set(nested, key, key in nested ? mergeItem(Reflect.get(nested, key), item) : item);
    }
    return nested;
  };
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(shared));
  for (const [key, item] of Object.entries(localized)) {
    Reflect.set(result, key, key in result ? mergeItem(Reflect.get(result, key), item) : item);
  }
  return result;
}

interface JsonBudget {
  nodes: number;
  readonly ancestors: WeakSet<object>;
}

function jsonValue(input: unknown, budget: JsonBudget, depth = 0): StudioJsonValue {
  budget.nodes += 1;
  if (budget.nodes > 10_000 || depth > 24) throw new Error("STUDIO_CONTENT_VALUES_TOO_COMPLEX");
  if (input === null || typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (Array.isArray(input)) {
    if (budget.ancestors.has(input)) throw new Error("STUDIO_CONTENT_VALUES_INVALID");
    budget.ancestors.add(input);
    const output = input.flatMap((item) =>
      item === undefined ? [] : [jsonValue(item, budget, depth + 1)],
    );
    budget.ancestors.delete(input);
    return output;
  }
  if (isRecord(input)) {
    if (budget.ancestors.has(input)) throw new Error("STUDIO_CONTENT_VALUES_INVALID");
    budget.ancestors.add(input);
    const output: Record<string, StudioJsonValue> = {};
    for (const [key, item] of Object.entries(input)) {
      if (item !== undefined) Reflect.set(output, key, jsonValue(item, budget, depth + 1));
    }
    budget.ancestors.delete(input);
    return output;
  }
  throw new Error("STUDIO_CONTENT_VALUES_INVALID");
}

function mutationValues(
  mutations: ReadonlyArray<ContentDraftMutation>,
  budget: JsonBudget,
): ReadonlyArray<StudioJsonValue> {
  return mutations.map((mutation) => {
    const output: Record<string, StudioJsonValue> = {
      operation: mutation.operation,
      path: [...mutation.path],
    };
    if (mutation.path.length > 24) throw new Error("STUDIO_CONTENT_VALUES_TOO_COMPLEX");
    if (mutation.operation === "set") {
      output.value = jsonValue(mutation.value, budget);
    }
    return output;
  });
}

function visibleFieldIds(definition: ContentFormDefinition): ReadonlySet<string> {
  const result = new Set<string>();
  const visit = (fields: ContentFormDefinition["fields"]) => {
    for (const field of fields) {
      result.add(field.id);
      visit(field.children);
    }
  };
  visit(definition.fields);
  return result;
}

function validationIssues(
  validation: StudioValidationDto | undefined,
  fieldIds: ReadonlySet<string>,
): ReadonlyArray<ContentFormServerIssue> {
  if (!validation || validation.status === "valid") return [];
  return validation.issues.flatMap((issue) =>
    fieldIds.has(issue.fieldId) ? [{ fieldId: issue.fieldId, message: issue.message }] : [],
  );
}

function isEntryWorkspace(
  data: StudioNewEntryWorkspaceDto | StudioEntryWorkspaceDto,
): data is StudioEntryWorkspaceDto {
  return "draft" in data && isRecord(data.draft);
}

function recoveryReason(change: StudioUnresolvedChange): string {
  switch (change.reason) {
    case "concurrent_change":
      return "This field also changed elsewhere.";
    case "list_changed":
      return "List changes require manual review.";
    case "read_only":
      return "This field is now read only.";
    case "removed_or_hidden":
      return "This field is no longer available.";
    case "kind_changed":
    case "localization_changed":
    case "parent_changed":
      return "This field's content model changed.";
    case "invalid_value":
      return "This value is not valid under the latest content model.";
  }
}

function isAmbiguous(error: Error | null): boolean {
  return (
    error instanceof StudioContentClientError &&
    (error.status === 503 || (error.status === 0 && error.retryable))
  );
}

function WorkspaceFailure({
  error,
  retry,
}: {
  readonly error: Error | null;
  readonly retry: () => void;
}) {
  const retryCountdown = useContentRetryCountdown(error);
  return (
    <div className="studio-panel" role="alert">
      <h2>Entry unavailable</h2>
      <p>{contentErrorMessage(error)}</p>
      <div className="studio-inline-actions">
        <Button type="button" variant="outline" disabled={retryCountdown > 0} onClick={retry}>
          {retryCountdown > 0 ? `Try again in ${retryCountdown}s` : "Try again"}
        </Button>
        <Link to="/content">Choose content</Link>
      </div>
    </div>
  );
}

function LocaleTabs({
  mode,
  collectionId,
  locale,
  entryId,
  locales,
}: {
  readonly mode: WorkspaceMode;
  readonly collectionId: string;
  readonly locale: string;
  readonly entryId: string | undefined;
  readonly locales: ReadonlyArray<{
    readonly id: string;
    readonly tag: string;
    readonly displayName: string;
  }>;
}) {
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % locales.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + locales.length) % locales.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = locales.length - 1;
    else return;
    event.preventDefault();
    const candidate = locales[next];
    if (candidate) links.current.get(candidate.id)?.focus();
  };
  return (
    <nav className="studio-locale-tabs" aria-label="Entry locales" role="tablist">
      {locales.map((candidate, index) => {
        const selected = candidate.tag === locale;
        return (
          <Link
            key={candidate.id}
            ref={(element) => {
              if (element) links.current.set(candidate.id, element);
              else links.current.delete(candidate.id);
            }}
            to={
              mode === "new"
                ? "/content/$collectionId/locales/$locale/entries/new"
                : "/content/$collectionId/locales/$locale/entries/$entryId"
            }
            params={
              mode === "new"
                ? { collectionId, locale: candidate.tag }
                : { collectionId, locale: candidate.tag, entryId: entryId ?? "" }
            }
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {candidate.displayName}
          </Link>
        );
      })}
    </nav>
  );
}

interface StudioRecoveryState {
  readonly latest: StudioEntryWorkspaceDto;
  readonly latestValues: Readonly<Record<string, unknown>>;
  readonly result: StudioRebaseResult;
  readonly kept: ReadonlySet<number>;
}

interface WorkspaceEditorProps {
  readonly mode: WorkspaceMode;
  readonly collectionId: string;
  readonly locale: string;
  readonly data: StudioNewEntryWorkspaceDto | StudioEntryWorkspaceDto;
  readonly locales: ReadonlyArray<{
    readonly id: string;
    readonly tag: string;
    readonly displayName: string;
  }>;
  readonly reload: () => Promise<unknown>;
  readonly notice: string | null;
  readonly onNotice: (notice: string | null) => void;
}

function WorkspaceEditor({
  mode,
  collectionId,
  locale,
  data,
  locales,
  reload,
  notice,
  onNotice,
}: WorkspaceEditorProps) {
  const client = useStudioContentClient();
  const queryClient = useQueryClient();
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const {
    bootstrap,
    mountPath,
    setWorkspaceDirty,
    allowWorkspaceNavigation,
    disallowWorkspaceNavigation,
    isWorkspaceNavigationAllowed,
  } = useStudioRuntime();
  const [authority, setAuthority] = useState(data);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<StudioPreviewSelection>({
    revisionId: null,
    label: "the last saved draft",
  });
  const definition = useMemo(() => adaptStudioContentForm(authority.form), [authority.form]);
  const existing = mode === "entry" && isEntryWorkspace(authority) ? authority : undefined;
  const initialValues = useMemo(
    () =>
      existing
        ? mergeValues(existing.draft.sharedValues, existing.draft.localizedValues)
        : applyGeneratedFormDefaults(
            definition.fields,
            {},
            {
              keying: "field_id",
              editableFieldIds: new Set(definition.editableFieldIds),
            },
          ),
    [definition, existing],
  );
  const [values, setValues] = useState<Readonly<Record<string, unknown>>>(initialValues);
  const [baseline, setBaseline] = useState<Readonly<Record<string, unknown>>>(initialValues);
  const [displayName, setDisplayName] = useState(existing?.draft.entry.displayName ?? "");
  const [savedName, setSavedName] = useState(existing?.draft.entry.displayName ?? "");
  const [nameVersion, setNameVersion] = useState(existing?.draft.entry.nameVersion ?? 1);
  const [sharedVersion, setSharedVersion] = useState(existing?.draft.sharedVersion ?? 0);
  const [localizedVersion, setLocalizedVersion] = useState(existing?.draft.localizedVersion ?? 0);
  const [headRevisionIds, setHeadRevisionIds] = useState({
    shared: existing?.draft.sharedRevisionId ?? null,
    localized: existing?.draft.localizedRevisionId ?? null,
  });
  const definitionFieldIds = useMemo(() => visibleFieldIds(definition), [definition]);
  const entryScope =
    existing === undefined ? null : { collectionId, locale, entryId: existing.draft.entry.id };
  const publication = useQuery({
    queryKey: contentQueryKeys.publication(collectionId, locale, entryScope?.entryId ?? ""),
    queryFn: ({ signal }) =>
      entryScope === null
        ? Promise.reject(new Error("STUDIO_ENTRY_SCOPE_MISSING"))
        : client.publication(entryScope, definitionFieldIds, signal),
    enabled: entryScope !== null,
    initialData: existing?.publication,
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
  });
  useEffect(() => {
    if (existing === undefined) return;
    queryClient.setQueryData(
      contentQueryKeys.publication(collectionId, locale, existing.draft.entry.id),
      existing.publication,
    );
  }, [collectionId, existing, locale, queryClient]);
  const [validation, setValidation] = useState<StudioValidationDto | undefined>(
    existing?.draft.validation,
  );
  const [focusIssueFieldId, setFocusIssueFieldId] = useState<string | null>(
    existing?.draft.validation.issues[0]?.fieldId ?? null,
  );
  const [pendingBody, setPendingBody] = useState<StudioJsonObject | null>(null);
  const [recovery, setRecovery] = useState<StudioRecoveryState | null>(null);
  const [recoveryError, setRecoveryError] = useState<Error | null>(null);
  const [renameNotice, setRenameNotice] = useState<string | null>(null);
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const valuesDirty = values !== baseline;
  useEffect(() => workspaceHeading.current?.focus(), []);
  const nameDirty = displayName !== savedName;
  const dirty = valuesDirty || nameDirty;
  const blocker = useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => !isWorkspaceNavigationAllowed(),
    withResolver: true,
  });
  useEffect(() => {
    disallowWorkspaceNavigation();
    return () => setWorkspaceDirty(false);
  }, [disallowWorkspaceNavigation, setWorkspaceDirty]);
  useEffect(() => {
    setWorkspaceDirty(dirty);
    if (dirty) disallowWorkspaceNavigation();
  }, [dirty, disallowWorkspaceNavigation, setWorkspaceDirty]);
  const sharedDefinition = useMemo(
    () =>
      partitionContentFormDefinition(definition, "shared", authority.capabilities.canSaveShared),
    [authority.capabilities.canSaveShared, definition],
  );
  const localizedDefinition = useMemo(
    () =>
      partitionContentFormDefinition(
        definition,
        "localized",
        authority.capabilities.canSaveLocalized,
      ),
    [authority.capabilities.canSaveLocalized, definition],
  );
  const picker = useCallback(
    (props: ContentReferencePickerProps) => <StudioReferencePicker {...props} locale={locale} />,
    [locale],
  );
  const validName = displayName.trim().length >= 1 && displayName.trim().length <= 100;
  const sharedFieldIds = useMemo(() => visibleFieldIds(sharedDefinition), [sharedDefinition]);
  const localizedFieldIds = useMemo(
    () => visibleFieldIds(localizedDefinition),
    [localizedDefinition],
  );
  const sharedAdvisoryIssues = useMemo(
    () => validateStudioValues(sharedDefinition, values),
    [sharedDefinition, values],
  );
  const localizedAdvisoryIssues = useMemo(
    () => validateStudioValues(localizedDefinition, values),
    [localizedDefinition, values],
  );
  const hasAdvisoryIssues = sharedAdvisoryIssues.length + localizedAdvisoryIssues.length > 0;

  const contentMutation = useMutation({
    mutationFn: async (body: StudioJsonObject) => {
      const signal = new AbortController().signal;
      return mode === "new"
        ? client.create({ collectionId, locale }, body, visibleFieldIds(definition), signal)
        : client.save(
            { collectionId, locale, entryId: existing?.draft.entry.id ?? "" },
            body,
            visibleFieldIds(definition),
            signal,
          );
    },
    retry: false,
    onMutate: () => {
      setFocusIssueFieldId(null);
      setValidation(undefined);
    },
    onSuccess: (result) => {
      setPendingBody(null);
      setValidation(result.validation);
      setFocusIssueFieldId(result.validation.issues[0]?.fieldId ?? null);
      setBaseline(values);
      if ("entry" in result) {
        setSavedName(result.entry.displayName);
        setNameVersion(result.entry.nameVersion);
        void queryClient.invalidateQueries({ queryKey: contentQueryKeys.root });
        allowWorkspaceNavigation();
        void navigate({
          to: "/content/$collectionId/locales/$locale/entries/$entryId",
          params: { collectionId, locale, entryId: result.entry.id },
        });
      } else {
        setSharedVersion(result.sharedVersion);
        setLocalizedVersion(result.localizedVersion);
        setHeadRevisionIds({
          shared: result.sharedRevisionId,
          localized: result.localizedRevisionId,
        });
        onNotice(null);
        void queryClient.invalidateQueries({
          queryKey: ["studio", "content", "entries", collectionId, locale],
        });
        if (existing !== undefined) {
          if (publication.data?.state !== "never_published") {
            void queryClient.invalidateQueries({
              queryKey: contentQueryKeys.publication(collectionId, locale, existing.draft.entry.id),
            });
          }
          void queryClient.invalidateQueries({
            queryKey: contentQueryKeys.entryRevisions(
              collectionId,
              locale,
              existing.draft.entry.id,
            ),
          });
          void queryClient.invalidateQueries({
            queryKey: contentQueryKeys.entryWorkspace(
              collectionId,
              locale,
              existing.draft.entry.id,
            ),
            refetchType: "none",
          });
        }
      }
    },
    onError: (_error, body) => setPendingBody(body),
  });
  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      client.rename(
        { collectionId, locale, entryId: existing?.draft.entry.id ?? "" },
        { displayName: name, expectedNameVersion: nameVersion },
        new AbortController().signal,
      ),
    retry: false,
    onMutate: () => setRenameNotice(null),
    onSuccess: (entry) => {
      setDisplayName(entry.displayName);
      setSavedName(entry.displayName);
      setNameVersion(entry.nameVersion);
      setRenameNotice("Entry name saved.");
      void queryClient.invalidateQueries({
        queryKey: ["studio", "content", "entries", collectionId],
      });
    },
    onError: async (error, desiredName) => {
      if (!isAmbiguous(error) || existing === undefined) return;
      try {
        const latest = await client.workspace(
          { collectionId, locale, entryId: existing.draft.entry.id },
          new AbortController().signal,
        );
        if (
          latest.draft.entry.displayName === desiredName &&
          latest.draft.entry.nameVersion > nameVersion
        ) {
          setDisplayName(latest.draft.entry.displayName);
          setSavedName(latest.draft.entry.displayName);
          setNameVersion(latest.draft.entry.nameVersion);
          setRenameNotice("Entry name was confirmed after reconnecting.");
        }
      } catch {
        // The local name remains intact and the bounded error state remains actionable.
      }
    },
  });

  const buildBody = (): StudioJsonObject => {
    const shared = fieldMutations(values, baseline, sharedDefinition.fields);
    const localized = fieldMutations(values, baseline, localizedDefinition.fields);
    if (shared.length + localized.length > 500) {
      throw new Error("STUDIO_CONTENT_MUTATIONS_TOO_MANY");
    }
    const budget: JsonBudget = { nodes: 0, ancestors: new WeakSet() };
    const sharedMutations = mutationValues(shared, budget);
    const localizedMutations = mutationValues(localized, budget);
    const common = {
      schemaRevisionId: authority.form.schemaRevisionId,
      contractHash: authority.form.contractHash,
      commandId: crypto.randomUUID(),
      sharedMutations,
      localizedMutations,
    };
    return mode === "new"
      ? { ...common, displayName: displayName.trim() }
      : {
          ...common,
          expectedSharedVersion: sharedVersion,
          expectedLocalizedVersion: localizedVersion,
        };
  };

  const submitContent = () => {
    if (!validName && mode === "new") return;
    setLocalSaveError(null);
    try {
      const body = buildBody();
      setPendingBody(body);
      contentMutation.mutate(body);
    } catch {
      setLocalSaveError(
        "These changes are too large or complex to save together. Reduce the value and try again.",
      );
    }
  };
  const reloadLatest = async () => {
    setPendingBody(null);
    await reload();
  };
  const reviewLatest = async () => {
    if (existing === undefined) return;
    setRecoveryError(null);
    try {
      const latest = await client.workspace(
        { collectionId, locale, entryId: existing.draft.entry.id },
        new AbortController().signal,
      );
      const latestDefinition = adaptStudioContentForm(latest.form);
      const latestValues = mergeValues(latest.draft.sharedValues, latest.draft.localizedValues);
      setRecovery({
        latest,
        latestValues,
        result: rebaseStudioValues({
          oldDefinition: definition,
          oldBaseline: baseline,
          localValues: values,
          latestDefinition,
          latestValues,
        }),
        kept: new Set(),
      });
    } catch (error) {
      setRecoveryError(error instanceof Error ? error : new Error("RECOVERY_FAILED"));
    }
  };
  const adoptAuthority = (
    latest: StudioEntryWorkspaceDto,
    latestValues: Readonly<Record<string, unknown>>,
    adoptedValues: Readonly<Record<string, unknown>>,
  ) => {
    setAuthority(latest);
    setValues(adoptedValues);
    setBaseline(latestValues);
    setSharedVersion(latest.draft.sharedVersion);
    setLocalizedVersion(latest.draft.localizedVersion);
    setNameVersion(latest.draft.entry.nameVersion);
    setDisplayName(latest.draft.entry.displayName);
    setSavedName(latest.draft.entry.displayName);
    setValidation(latest.draft.validation);
    setPendingBody(null);
    setLocalSaveError(null);
    setRecoveryError(null);
    setRecovery(null);
    contentMutation.reset();
  };
  const adoptRecovery = () => {
    if (recovery === null) return;
    let adopted = recovery.result.values;
    for (const [index, change] of recovery.result.unresolved.entries()) {
      if (recovery.kept.has(index)) adopted = keepStudioUnresolvedChange(adopted, change);
    }
    adoptAuthority(recovery.latest, recovery.latestValues, adopted);
  };
  const localeLabel = locales.find((candidate) => candidate.tag === locale)?.displayName ?? locale;
  const mutationConflict =
    contentMutation.error instanceof StudioContentClientError &&
    (contentMutation.error.code === "DRAFT_VERSION_CONFLICT" ||
      contentMutation.error.code === "STALE_SCHEMA");

  return (
    <>
      <section className="studio-stack" aria-labelledby="workspace-heading">
        <div className="studio-breadcrumbs">
          <Link to="/content/$collectionId/locales/$locale" params={{ collectionId, locale }}>
            Entries
          </Link>
          <span aria-hidden="true">/</span>
          <span>{mode === "new" ? "New entry" : existing?.draft.entry.displayName}</span>
        </div>
        <div>
          <p className="studio-eyebrow">{locale}</p>
          <h2 ref={workspaceHeading} id="workspace-heading" tabIndex={-1}>
            {mode === "new" ? "Create entry" : "Edit entry"}
          </h2>
          {publication.data !== undefined ? (
            <StudioPublicationBadge status={publication.data} />
          ) : null}
        </div>
        {notice !== null ? (
          <p className="studio-panel" role="status">
            {notice}
          </p>
        ) : null}
        <LocaleTabs
          mode={mode}
          collectionId={collectionId}
          locale={locale}
          entryId={existing?.draft.entry.id}
          locales={locales}
        />
        <div className="studio-panel studio-name-editor">
          <label htmlFor="studio-entry-name">Entry name</label>
          <Input
            id="studio-entry-name"
            value={displayName}
            minLength={1}
            maxLength={100}
            disabled={
              contentMutation.isPending ||
              renameMutation.isPending ||
              (mode === "entry" && !authority.capabilities.canRename)
            }
            onChange={(event) => {
              setLocalSaveError(null);
              setPendingBody(null);
              setDisplayName(event.target.value);
            }}
          />
          {!validName ? (
            <p className="studio-error">Enter a name between 1 and 100 characters.</p>
          ) : null}
          {mode === "entry" && authority.capabilities.canRename ? (
            <Button
              type="button"
              variant="outline"
              disabled={!nameDirty || !validName || renameMutation.isPending}
              onClick={() => renameMutation.mutate(displayName.trim())}
            >
              {renameMutation.isPending ? "Renaming…" : "Rename"}
            </Button>
          ) : null}
          {renameNotice ? (
            <p className="studio-muted" role="status">
              {renameNotice}
            </p>
          ) : renameMutation.isError ? (
            <p role="alert">{contentErrorMessage(renameMutation.error)}</p>
          ) : null}
        </div>
        {mutationConflict ? (
          <div className="studio-panel" role="alert">
            <h3>
              {contentMutation.error instanceof StudioContentClientError &&
              contentMutation.error.code === "STALE_SCHEMA"
                ? "Content model changed"
                : "Draft changed elsewhere"}
            </h3>
            <p>{contentErrorMessage(contentMutation.error)}</p>
            <div className="studio-inline-actions">
              <Button type="button" variant="outline" onClick={() => void reviewLatest()}>
                Review latest changes
              </Button>
              <Button type="button" variant="ghost" onClick={() => void reloadLatest()}>
                Discard everything and reload
              </Button>
            </div>
            {recoveryError ? <p>{contentErrorMessage(recoveryError)}</p> : null}
          </div>
        ) : null}
        {localSaveError ? (
          <div className="studio-panel" role="alert">
            <p>{localSaveError}</p>
          </div>
        ) : null}
        {contentMutation.isError && !mutationConflict ? (
          <div className="studio-panel" role="alert">
            <p>{contentErrorMessage(contentMutation.error)}</p>
            {pendingBody !== null && isAmbiguous(contentMutation.error) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => contentMutation.mutate(pendingBody)}
              >
                Retry the exact request
              </Button>
            ) : null}
          </div>
        ) : null}
        <StudioReferenceResolutionProvider locale={locale}>
          {sharedDefinition.fields.length > 0 ? (
            <section className="studio-form-section" aria-labelledby="shared-fields-heading">
              <div>
                <h3 id="shared-fields-heading">Shared</h3>
                <p className="studio-muted">These values apply across every locale.</p>
              </div>
              <ContentForm
                definition={sharedDefinition}
                values={values}
                onValuesChange={(next) => {
                  setLocalSaveError(null);
                  setPendingBody(null);
                  setValues(next);
                }}
                serverIssues={[
                  ...validationIssues(validation, sharedFieldIds),
                  ...sharedAdvisoryIssues,
                ]}
                issueSummaryLabel="Review the highlighted shared fields."
                focusIssueFieldId={
                  focusIssueFieldId && sharedFieldIds.has(focusIssueFieldId)
                    ? focusIssueFieldId
                    : null
                }
                submitting={contentMutation.isPending}
                showSubmitAction={false}
                showStatusMessage={false}
                referencePicker={picker}
                defaultKeying="field_id"
              />
            </section>
          ) : null}
          {localizedDefinition.fields.length > 0 ? (
            <section className="studio-form-section" aria-labelledby="localized-fields-heading">
              <div>
                <h3 id="localized-fields-heading">{localeLabel}</h3>
                <p className="studio-muted">These values apply only to {locale}.</p>
              </div>
              <ContentForm
                definition={localizedDefinition}
                values={values}
                onValuesChange={(next) => {
                  setLocalSaveError(null);
                  setPendingBody(null);
                  setValues(next);
                }}
                serverIssues={[
                  ...validationIssues(validation, localizedFieldIds),
                  ...localizedAdvisoryIssues,
                ]}
                issueSummaryLabel="Review the highlighted locale fields."
                focusIssueFieldId={
                  focusIssueFieldId && localizedFieldIds.has(focusIssueFieldId)
                    ? focusIssueFieldId
                    : null
                }
                submitting={contentMutation.isPending}
                showSubmitAction={false}
                showStatusMessage={false}
                referencePicker={picker}
                defaultKeying="field_id"
              />
            </section>
          ) : null}
        </StudioReferenceResolutionProvider>
        {existing !== undefined &&
        publication.data !== undefined &&
        authority.capabilities.canPublish ? (
          <StudioPublicationPanel
            collectionId={collectionId}
            locale={locale}
            localeLabel={localeLabel}
            entryId={existing.draft.entry.id}
            form={authority.form}
            visibleFieldIds={definitionFieldIds}
            status={publication.data}
            dirty={dirty}
            onReloadLatest={reloadLatest}
          />
        ) : null}
        {existing !== undefined && studioPreviewEnabled() ? (
          <StudioPreviewPanel
            mountPath={mountPath}
            collectionId={collectionId}
            locale={locale}
            entryId={existing.draft.entry.id}
            entryName={savedName}
            open={previewOpen}
            selection={previewSelection}
            savedVersion={`${sharedVersion}:${localizedVersion}`}
            onOpenChange={setPreviewOpen}
            onShowCurrent={() =>
              setPreviewSelection({ revisionId: null, label: "the last saved draft" })
            }
          />
        ) : null}
        {existing !== undefined ? (
          <StudioHistoryPanel
            collectionId={collectionId}
            locale={locale}
            localeLabel={localeLabel}
            entryId={existing.draft.entry.id}
            currentUserId={bootstrap.user.id}
            form={authority.form}
            visibleFieldIds={definitionFieldIds}
            headRevisionIds={headRevisionIds}
            versions={{ shared: sharedVersion, localized: localizedVersion }}
            canRestore={{
              shared: authority.capabilities.canSaveShared,
              localized: authority.capabilities.canSaveLocalized,
            }}
            dirty={dirty}
            onRestored={async (message) => {
              onNotice(message);
              await reload();
            }}
            onReloadLatest={reloadLatest}
            {...(studioPreviewEnabled()
              ? {
                  onPreview: (revision: StudioRevisionSummaryDto) => {
                    setPreviewSelection({
                      revisionId: revision.id,
                      label: `${revision.scope === "shared" ? "shared" : localeLabel} revision ${revision.sequence}`,
                    });
                    setPreviewOpen(true);
                  },
                }
              : {})}
          />
        ) : null}
        <div className="studio-save-bar">
          <Button
            type="button"
            disabled={
              contentMutation.isPending ||
              hasAdvisoryIssues ||
              (mode === "new" ? !validName : !valuesDirty) ||
              (!authority.capabilities.canSaveShared && !authority.capabilities.canSaveLocalized)
            }
            onClick={submitContent}
          >
            {contentMutation.isPending ? "Saving…" : mode === "new" ? "Create entry" : "Save draft"}
          </Button>
          <p className="studio-muted" aria-live="polite">
            {contentMutation.isPending
              ? "Saving changes…"
              : contentMutation.isError
                ? "Save failed. Your changes remain unsaved."
                : dirty || mode === "new"
                  ? "Unsaved changes."
                  : validation?.status === "invalid"
                    ? "Saved with validation issues."
                    : validation?.status === "restricted_issues"
                      ? "Saved. Additional restricted validation issues may exist."
                      : "All changes saved."}
          </p>
        </div>
      </section>
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved Studio changes exist only in this browser tab and will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={recovery !== null}>
        <AlertDialogContent className="studio-recovery-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Review latest draft changes</AlertDialogTitle>
            <AlertDialogDescription>
              Compatible, uncontested changes can be carried onto the latest draft. Nothing is saved
              until you choose Save draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {recovery ? (
            <div className="studio-recovery-content">
              <p>
                {recovery.result.carriedCount} compatible change
                {recovery.result.carriedCount === 1 ? "" : "s"} can be carried safely.
              </p>
              {recovery.result.unresolved.length > 0 ? (
                <ul className="studio-recovery-list">
                  {recovery.result.unresolved.map((change, index) => (
                    <li key={`${change.fieldId}-${change.reason}`}>
                      <div>
                        <strong>{change.label}</strong>
                        <span>
                          {change.section === "shared" ? "Shared" : locale}:{" "}
                          {recoveryReason(change)}
                        </span>
                      </div>
                      {change.canKeep ? (
                        <Button
                          type="button"
                          variant="outline"
                          aria-pressed={recovery.kept.has(index)}
                          onClick={() =>
                            setRecovery((current) => {
                              if (current === null) return null;
                              const kept = new Set(current.kept);
                              if (kept.has(index)) kept.delete(index);
                              else kept.add(index);
                              return { ...current, kept };
                            })
                          }
                        >
                          {recovery.kept.has(index) ? "Use latest value" : "Keep my change"}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>There are no unresolved changes.</p>
              )}
            </div>
          ) : null}
          <AlertDialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRecovery(null)}>
              Keep editing without recovery
            </Button>
            {recovery ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  adoptAuthority(recovery.latest, recovery.latestValues, recovery.latestValues)
                }
              >
                Discard all local changes
              </Button>
            ) : null}
            <AlertDialogAction onClick={adoptRecovery}>Adopt reviewed changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WorkspaceRoute({ mode }: { readonly mode: WorkspaceMode }) {
  const params = useParams({ strict: false });
  const collectionId = params.collectionId ?? "";
  const locale = params.locale ?? "";
  const entryId = params.entryId ?? "";
  const context = useStudioContentContext();
  const client = useStudioContentClient();
  const [notice, setNotice] = useState<string | null>(null);
  const routeAvailable =
    context.data?.collections.some((collection) => collection.id === collectionId) === true &&
    context.data.locales.some((candidate) => candidate.tag === locale);
  const workspace = useQuery({
    queryKey:
      mode === "new"
        ? contentQueryKeys.newWorkspace(collectionId, locale)
        : contentQueryKeys.entryWorkspace(collectionId, locale, entryId),
    queryFn: ({ signal }) =>
      mode === "new"
        ? client.newWorkspace({ collectionId, locale }, signal)
        : client.workspace({ collectionId, locale, entryId }, signal),
    enabled: routeAvailable,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 0,
  });

  if (context.isPending) return <p role="status">Loading content access…</p>;
  if (context.isError)
    return <WorkspaceFailure error={context.error} retry={() => void context.refetch()} />;
  if (!routeAvailable) {
    return (
      <div className="studio-panel" role="alert">
        <h2>Entry route unavailable</h2>
        <p>The collection or locale is unavailable, or you no longer have access.</p>
        <Link to="/content">Choose content</Link>
      </div>
    );
  }
  if (workspace.isPending) return <p role="status">Loading entry workspace…</p>;
  if (workspace.isError)
    return <WorkspaceFailure error={workspace.error} retry={() => void workspace.refetch()} />;
  const revisionKey = isEntryWorkspace(workspace.data)
    ? `${workspace.data.form.schemaRevisionId}:${workspace.data.draft.sharedVersion}:${workspace.data.draft.localizedVersion}`
    : workspace.data.form.schemaRevisionId;
  return (
    <WorkspaceEditor
      key={revisionKey}
      mode={mode}
      collectionId={collectionId}
      locale={locale}
      data={workspace.data}
      locales={context.data.locales}
      reload={workspace.refetch}
      notice={notice}
      onNotice={setNotice}
    />
  );
}

export function NewEntryWorkspace() {
  return <WorkspaceRoute mode="new" />;
}

export function EntryWorkspace() {
  return <WorkspaceRoute mode="entry" />;
}
