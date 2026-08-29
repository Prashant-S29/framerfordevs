import { adaptAuthoringGeneratedForm } from "@framerfordevs/content-form/authoring-adapter";
import type { ContentFormField } from "@framerfordevs/content-form/model";
import {
  apiKeyValuesToStableIds,
  fieldMutations,
  partitionContentFormDefinition,
  type ContentDraftMutation,
} from "@framerfordevs/content-form/values";
import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema } from "@framerfordevs/schema/validate";
import {
  AuthoringCreateResult,
  AuthoringDraftMutationResult,
  AuthoringEntryDraft,
  AuthoringEntryPage,
  AuthoringEntrySummary,
  AuthoringGeneratedForm,
  AuthoringPublicationPlan,
  AuthoringPublicationStatus,
  AuthoringPublishResult,
  AuthoringUnpublishResult,
  type AuthoringMutation,
} from "@framerfordevs/sdk/authoring";
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { Suspense, StrictMode, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { EditorOperationRequest } from "../../src/editor/protocol";
import "../editor.css";
import { projectLocalContentForm } from "../local-form";

const ContentForm = lazy(() =>
  import("@framerfordevs/content-form/renderer").then((module) => ({
    default: module.ContentForm,
  })),
);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

const ProjectDocument = Schema.declare<ProjectSchema>(isProjectSchema, {
  identifier: "EditorProjectSchemaDocument",
});
const LocalSchemaSnapshot = Schema.Struct({
  localProject: ProjectDocument,
  hostedProject: ProjectDocument,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Collection = Schema.Struct({
  sourceKey: Schema.String,
  apiKey: Schema.String,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Status = Schema.Struct({
  projectId: Schema.String,
  environment: Schema.String,
  schemaMatchesHosted: Schema.Boolean,
  schemaValid: Schema.Boolean,
  schemaGeneration: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  schemaDiagnosticCode: Schema.NullOr(Schema.String),
  localCollectionCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  locales: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))).pipe(
    Schema.maxItems(100),
  ),
  collections: Schema.Array(Collection),
}).annotations({ parseOptions: { onExcessProperty: "error" } });

type EditorStatus = typeof Status.Type;

class EditorRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const fragment = new URLSearchParams(window.location.hash.slice(1));
const sessionChallenge = fragment.get("session");
window.history.replaceState(null, "", window.location.pathname);

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function failureCode(payload: unknown): string {
  const object = record(payload);
  const direct = object?.code;
  if (typeof direct === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(direct)) return direct;
  const error = record(object?.error);
  const nested = error?.code;
  return typeof nested === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(nested)
    ? nested
    : "EDITOR_REQUEST_FAILED";
}

function sessionHeaders(json = false): Readonly<Record<string, string>> {
  return {
    ...(sessionChallenge === null ? {} : { "X-FFD-Editor-Session": sessionChallenge }),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text === "" ? null : JSON.parse(text);
  } catch {
    throw new EditorRequestError(502, "EDITOR_RESPONSE_INVALID");
  }
}

async function initializeSession(): Promise<void> {
  if (sessionChallenge === null || sessionChallenge.length < 43 || sessionChallenge.length > 128) {
    throw new EditorRequestError(401, "EDITOR_SESSION_INVALID");
  }
  const response = await fetch("/api/session", {
    method: "POST",
    headers: sessionHeaders(true),
    body: "{}",
    redirect: "error",
  });
  if (!response.ok) throw new EditorRequestError(response.status, "EDITOR_SESSION_INVALID");
}

async function statusRequest(): Promise<EditorStatus> {
  const response = await fetch("/api/status", {
    headers: sessionHeaders(),
    redirect: "error",
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw new EditorRequestError(response.status, failureCode(payload));
  return Schema.decodeUnknownSync(Status)(payload, { onExcessProperty: "error" });
}

async function operationData<A, I>(
  schema: Schema.Schema<A, I, never>,
  request: EditorOperationRequest,
): Promise<A> {
  const response = await fetch("/api/operation", {
    method: "POST",
    headers: sessionHeaders(true),
    body: JSON.stringify(request),
    redirect: "error",
  });
  const payload = await responsePayload(response);
  const envelope = record(payload);
  if (!response.ok || envelope?.ok !== true) {
    throw new EditorRequestError(response.status, failureCode(payload));
  }
  return Schema.decodeUnknownSync(schema)(envelope.data, { onExcessProperty: "error" });
}

function jsonValue(value: unknown, depth = 0): JsonValue {
  if (depth > 32) throw new Error("EDITOR_VALUE_INVALID");
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, depth + 1));
  const object = record(value);
  if (object === null) throw new Error("EDITOR_VALUE_INVALID");
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonValue(item, depth + 1)]),
  );
}

function apiPath(
  fields: ReadonlyArray<ContentFormField>,
  stablePath: ContentDraftMutation["path"],
): readonly [string, ...ReadonlyArray<string>] {
  const result: Array<string> = [];
  let available = fields;
  for (const fieldId of stablePath) {
    const field = available.find((candidate) => candidate.id === fieldId);
    if (field === undefined || field.apiKey === null) throw new Error("EDITOR_MUTATION_INVALID");
    result.push(field.apiKey);
    available = field.children;
  }
  const first = result[0];
  if (first === undefined) throw new Error("EDITOR_MUTATION_INVALID");
  return [first, ...result.slice(1)];
}

function authoringMutations(
  scope: "shared" | "localized",
  mutations: ReadonlyArray<ContentDraftMutation>,
  fields: ReadonlyArray<ContentFormField>,
): ReadonlyArray<AuthoringMutation> {
  return mutations.map((mutation) =>
    mutation.operation === "set"
      ? {
          operation: "set",
          scope,
          path: apiPath(fields, mutation.path),
          value: jsonValue(mutation.value),
        }
      : { operation: "unset", scope, path: apiPath(fields, mutation.path) },
  );
}

function errorMessage(error: unknown): string {
  if (!(error instanceof EditorRequestError)) return "The operation could not be completed.";
  switch (error.code) {
    case "DRAFT_CONFLICT":
      return "This draft changed elsewhere. Your edits are preserved; reload before reapplying.";
    case "ENTRY_NAME_CONFLICT":
      return "This entry name changed elsewhere. Reload before renaming again.";
    case "EDITOR_SCHEMA_DRIFT":
      return "Editing is read only until local and hosted structure match.";
    case "EDITOR_COMMAND_PENDING":
      return "A previous command has an uncertain result. Reconcile it before another write.";
    default:
      return `The operation failed (${error.code}).`;
  }
}

function readPreviewTemplate(): string {
  try {
    return window.localStorage.getItem("ffd-editor-preview-template") ?? "";
  } catch {
    return "";
  }
}

function writePreviewTemplate(value: string): void {
  try {
    window.localStorage.setItem("ffd-editor-preview-template", value);
  } catch {
    // Browser storage is optional; the current in-memory value remains usable.
  }
}

function previewUrl(
  template: string,
  input: { collection: string; entry: string; locale: string },
) {
  const expanded = template
    .replaceAll("{collection}", encodeURIComponent(input.collection))
    .replaceAll("{entry}", encodeURIComponent(input.entry))
    .replaceAll("{locale}", encodeURIComponent(input.locale));
  try {
    const url = new URL(expanded);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function EditorApp() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["editor", "status"],
    queryFn: statusRequest,
    refetchInterval: 750,
  });
  const collections = status.data?.collections ?? [];
  const locales = useMemo(() => status.data?.locales ?? [], [status.data?.locales]);
  const [collectionKey, setCollectionKey] = useState("");
  const [localeInput, setLocaleInput] = useState("");
  const [locale, setLocale] = useState("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [sharedValues, setSharedValues] = useState<Readonly<Record<string, unknown>>>({});
  const [localizedValues, setLocalizedValues] = useState<Readonly<Record<string, unknown>>>({});
  const [renameValue, setRenameValue] = useState("");
  const [createName, setCreateName] = useState("");
  const [notice, setNotice] = useState("");
  const [publicationIssues, setPublicationIssues] = useState<
    ReadonlyArray<{ readonly path: string; readonly code: string; readonly message: string }>
  >([]);
  const loadedDraftKey = useRef<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState(readPreviewTemplate);

  const activeCollection =
    collections.find((collection) => collection.apiKey === collectionKey) ?? collections[0] ?? null;
  const activeCollectionKey = activeCollection?.apiKey ?? "";
  const editingEnabled =
    status.data?.schemaValid === true && status.data.schemaMatchesHosted === true;

  useEffect(() => {
    if (collectionKey === "" && activeCollection !== null)
      setCollectionKey(activeCollection.apiKey);
  }, [activeCollection, collectionKey]);

  useEffect(() => {
    const defaultLocale = locales[0];
    if (locale === "" && defaultLocale !== undefined) {
      setLocaleInput(defaultLocale);
      setLocale(defaultLocale);
    }
  }, [locale, locales]);

  const localSchema = useQuery({
    queryKey: ["editor", "local-schema", status.data?.schemaGeneration ?? 0],
    queryFn: () => operationData(LocalSchemaSnapshot, { operation: "schema.local" }),
    enabled: status.data !== undefined,
  });

  const form = useQuery({
    queryKey: ["editor", "form", activeCollectionKey],
    queryFn: () =>
      operationData(AuthoringGeneratedForm, {
        operation: "form.get",
        collectionKey: activeCollectionKey,
      }),
    enabled: activeCollectionKey !== "",
    staleTime: 1_000,
    refetchInterval: 2_000,
  });

  const entries = useInfiniteQuery({
    queryKey: ["editor", "entries", activeCollectionKey, locale],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      operationData(AuthoringEntryPage, {
        operation: "entries.list",
        collectionKey: activeCollectionKey,
        locale,
        limit: 50,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (last, pages) => {
      if (last.nextCursor === null) return undefined;
      return pages.some((page) => page.nextCursor === last.nextCursor)
        ? undefined
        : last.nextCursor;
    },
    enabled: activeCollectionKey !== "" && locale !== "",
    maxPages: 20,
  });
  const entryItems = entries.data?.pages.flatMap((page) => page.items) ?? [];

  const draft = useQuery({
    queryKey: ["editor", "draft", activeCollectionKey, locale, entryId],
    queryFn: () =>
      operationData(AuthoringEntryDraft, {
        operation: "entry.get",
        collectionKey: activeCollectionKey,
        locale,
        entryId: entryId ?? "",
      }),
    enabled: activeCollectionKey !== "" && locale !== "" && entryId !== null,
  });
  const publication = useQuery({
    queryKey: ["editor", "publication", activeCollectionKey, locale, entryId],
    queryFn: () =>
      operationData(AuthoringPublicationStatus, {
        operation: "publication.status",
        collectionKey: activeCollectionKey,
        locale,
        entryId: entryId ?? "",
      }),
    enabled: activeCollectionKey !== "" && locale !== "" && entryId !== null,
  });

  const hostedDefinition = useMemo(
    () => (form.data === undefined ? null : adaptAuthoringGeneratedForm(form.data)),
    [form.data],
  );
  const definition = useMemo(() => {
    if (editingEnabled) return hostedDefinition;
    if (form.data === undefined || localSchema.data === undefined || activeCollection === null)
      return hostedDefinition;
    return (
      projectLocalContentForm({
        localProject: localSchema.data.localProject,
        hostedProject: localSchema.data.hostedProject,
        collectionSourceKey: activeCollection.sourceKey,
        hostedForm: form.data,
      }) ?? hostedDefinition
    );
  }, [activeCollection, editingEnabled, form.data, hostedDefinition, localSchema.data]);
  const sharedDefinition = useMemo(
    () =>
      definition === null
        ? null
        : partitionContentFormDefinition(
            definition,
            "shared",
            editingEnabled && draft.data?.canEditShared === true,
          ),
    [definition, draft.data?.canEditShared, editingEnabled],
  );
  const localizedDefinition = useMemo(
    () =>
      definition === null
        ? null
        : partitionContentFormDefinition(definition, "localized", editingEnabled),
    [definition, editingEnabled],
  );
  const baselineShared = useMemo(
    () =>
      definition === null || draft.data === undefined
        ? {}
        : apiKeyValuesToStableIds(definition.fields, draft.data.sharedValues),
    [definition, draft.data],
  );
  const baselineLocalized = useMemo(
    () =>
      definition === null || draft.data === undefined
        ? {}
        : apiKeyValuesToStableIds(definition.fields, draft.data.localizedValues),
    [definition, draft.data],
  );

  useEffect(() => {
    if (draft.data === undefined || definition === null) return;
    const key = [
      draft.data.entry.id,
      draft.data.schemaRevisionId,
      draft.data.sharedVersion,
      draft.data.sharedRevisionId ?? "none",
      draft.data.localizedVersion,
      draft.data.localizedRevisionId ?? "none",
    ].join(":");
    if (loadedDraftKey.current === key) return;
    loadedDraftKey.current = key;
    setSharedValues(baselineShared);
    setLocalizedValues(baselineLocalized);
    setRenameValue(draft.data.entry.displayName);
  }, [baselineLocalized, baselineShared, definition, draft.data]);

  const dirty =
    JSON.stringify(sharedValues) !== JSON.stringify(baselineShared) ||
    JSON.stringify(localizedValues) !== JSON.stringify(baselineLocalized);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const navigate = (action: () => void) => {
    if (dirty && !window.confirm("Discard unsaved entry changes?")) return;
    action();
  };

  const invalidateEntry = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["editor", "draft", activeCollectionKey, locale, entryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["editor", "publication", activeCollectionKey, locale, entryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["editor", "entries", activeCollectionKey, locale],
      }),
    ]);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (
        draft.data === undefined ||
        definition === null ||
        sharedDefinition === null ||
        localizedDefinition === null ||
        entryId === null
      ) {
        throw new Error("EDITOR_DRAFT_UNAVAILABLE");
      }
      const mutations = [
        ...authoringMutations(
          "shared",
          fieldMutations(sharedValues, baselineShared, sharedDefinition.fields),
          definition.fields,
        ),
        ...authoringMutations(
          "localized",
          fieldMutations(localizedValues, baselineLocalized, localizedDefinition.fields),
          definition.fields,
        ),
      ];
      if (mutations.length === 0) return null;
      return operationData(AuthoringDraftMutationResult, {
        operation: "entry.save",
        collectionKey: activeCollectionKey,
        locale,
        entryId,
        schemaRevisionId: draft.data.schemaRevisionId,
        contractHash: draft.data.contractHash,
        expectedSharedVersion: draft.data.sharedVersion,
        expectedLocalizedVersion: draft.data.localizedVersion,
        mutations,
      });
    },
    onSuccess: async () => {
      setNotice("Draft saved.");
      await invalidateEntry();
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const createEntry = useMutation({
    mutationFn: () => {
      if (form.data === undefined) throw new Error("EDITOR_FORM_UNAVAILABLE");
      return operationData(AuthoringCreateResult, {
        operation: "entry.create",
        collectionKey: activeCollectionKey,
        locale,
        displayName: createName,
        schemaRevisionId: form.data.revisionId,
        contractHash: form.data.contractHash,
        mutations: [],
      });
    },
    onSuccess: async (created) => {
      setCreateName("");
      setEntryId(created.entry.id);
      setNotice("Entry created.");
      await queryClient.invalidateQueries({
        queryKey: ["editor", "entries", activeCollectionKey, locale],
      });
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const rename = useMutation({
    mutationFn: () => {
      if (draft.data === undefined || entryId === null) throw new Error("EDITOR_DRAFT_UNAVAILABLE");
      return operationData(AuthoringEntrySummary, {
        operation: "entry.rename",
        collectionKey: activeCollectionKey,
        locale,
        entryId,
        displayName: renameValue,
        expectedNameVersion: draft.data.entry.nameVersion,
      });
    },
    onSuccess: async () => {
      setNotice("Entry renamed.");
      await invalidateEntry();
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (entryId === null) throw new Error("EDITOR_DRAFT_UNAVAILABLE");
      const plan = await operationData(AuthoringPublicationPlan, {
        operation: "publication.validate",
        collectionKey: activeCollectionKey,
        locale,
        entryId,
      });
      if (!plan.valid || plan.authorityHash === null) return { plan, published: null };
      const published = await operationData(AuthoringPublishResult, {
        operation: "publication.publish",
        collectionKey: activeCollectionKey,
        locale,
        entryId,
        authorityHash: plan.authorityHash,
        expectedStateVersion: plan.stateVersion,
        expectedPublicationId: plan.currentPublicationId,
        expectedSchemaRevisionId: plan.schemaRevisionId,
        expectedContractHash: plan.contractHash,
        expectedSharedVersion: plan.sharedVersion,
        expectedSharedRevisionId: plan.sharedRevisionId,
        expectedLocalizedVersion: plan.localizedVersion,
        expectedLocalizedRevisionId: plan.localizedRevisionId,
      });
      return { plan, published };
    },
    onSuccess: async (result) => {
      setPublicationIssues(result.plan.issues);
      setNotice(result.published === null ? "Publication validation failed." : "Locale published.");
      await invalidateEntry();
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const unpublish = useMutation({
    mutationFn: () => {
      if (entryId === null || publication.data === undefined)
        throw new Error("EDITOR_PUBLICATION_UNAVAILABLE");
      return operationData(AuthoringUnpublishResult, {
        operation: "publication.unpublish",
        collectionKey: activeCollectionKey,
        locale,
        entryId,
        expectedStateVersion: publication.data.stateVersion,
        expectedPublicationId: publication.data.currentPublication?.id ?? null,
      });
    },
    onSuccess: async () => {
      setPublicationIssues([]);
      setNotice("Locale unpublished.");
      await invalidateEntry();
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const reload = async () => {
    if (dirty && !window.confirm("Reload and discard unsaved entry changes?")) return;
    await draft.refetch();
    setNotice("Current draft reloaded.");
  };

  const preview =
    entryId === null || previewTemplate === ""
      ? null
      : previewUrl(previewTemplate, {
          collection: activeCollectionKey,
          entry: entryId,
          locale,
        });

  if (status.isPending) return <main className="editor-main">Starting secure editor session…</main>;
  if (status.isError)
    return (
      <main className="editor-main" role="alert">
        The secure editor session could not start. Close this tab and run <code>ffd editor</code>{" "}
        again.
      </main>
    );

  const busy = save.isPending || publish.isPending || unpublish.isPending || rename.isPending;

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div>
          <h1>Framer for Devs editor</h1>
          <p>
            {status.data.projectId} · {status.data.environment}
          </p>
        </div>
        <strong>{dirty ? "Unsaved changes" : "All local changes saved"}</strong>
      </header>

      {!status.data.schemaValid || !status.data.schemaMatchesHosted ? (
        <div className="editor-banner" data-kind="danger" role="status">
          {!status.data.schemaValid
            ? `Local schema is invalid (${status.data.schemaDiagnosticCode ?? "CLI_SCHEMA_INVALID"}). The last valid view is read only.`
            : "Local structure differs from hosted structure. Run ffd schema plan and ffd schema push; editing remains read only."}
        </div>
      ) : null}

      <div className="editor-grid">
        <aside className="editor-nav editor-stack" aria-label="Content navigation">
          <div className="editor-field">
            <label htmlFor="collection">Collection</label>
            <select
              id="collection"
              className="editor-select"
              value={activeCollectionKey}
              onChange={(event) =>
                navigate(() => {
                  setCollectionKey(event.target.value);
                  setEntryId(null);
                  setNotice("");
                  setPublicationIssues([]);
                })
              }
            >
              {collections.map((collection) => (
                <option key={collection.sourceKey} value={collection.apiKey}>
                  {collection.apiKey}
                </option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label htmlFor="locale">Locale</label>
            <div className="editor-row">
              <input
                id="locale"
                className="editor-input"
                value={localeInput}
                list="editor-project-locales"
                maxLength={64}
                onChange={(event) => setLocaleInput(event.target.value)}
              />
              <datalist id="editor-project-locales">
                {locales.map((localeTag) => (
                  <option key={localeTag} value={localeTag} />
                ))}
              </datalist>
              <button
                className="editor-button"
                type="button"
                onClick={() =>
                  navigate(() => {
                    setLocale(localeInput);
                    setEntryId(null);
                    setNotice("");
                    setPublicationIssues([]);
                  })
                }
              >
                Open
              </button>
            </div>
          </div>

          <form
            className="editor-card editor-stack"
            onSubmit={(event) => {
              event.preventDefault();
              createEntry.mutate();
            }}
          >
            <strong>Create entry</strong>
            <label className="editor-field">
              <span className="editor-legend">Display name</span>
              <input
                className="editor-input"
                value={createName}
                maxLength={100}
                required
                disabled={!editingEnabled || createEntry.isPending}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <button
              className="editor-button"
              type="submit"
              disabled={
                !editingEnabled ||
                locale === "" ||
                createName.trim() === "" ||
                createEntry.isPending
              }
            >
              Create
            </button>
          </form>

          <div>
            <h2 className="editor-legend">Entries</h2>
            {entries.isPending ? <p className="editor-muted">Loading entries…</p> : null}
            {entries.isError ? <p role="alert">Entries could not be loaded.</p> : null}
            <ul className="editor-list">
              {entryItems.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="editor-button"
                    aria-current={entry.id === entryId ? "page" : undefined}
                    onClick={() =>
                      navigate(() => {
                        setEntryId(entry.id);
                        setNotice("");
                        setPublicationIssues([]);
                      })
                    }
                  >
                    {entry.displayName}
                  </button>
                </li>
              ))}
            </ul>
            {entries.hasNextPage ? (
              <button
                className="editor-button"
                type="button"
                disabled={entries.isFetchingNextPage}
                onClick={() => entries.fetchNextPage()}
              >
                Load more
              </button>
            ) : null}
            {!entries.isPending && entryItems.length === 0 ? (
              <p className="editor-muted">No entries in this locale.</p>
            ) : null}
          </div>
        </aside>

        <main className="editor-main editor-stack">
          {entryId === null ? (
            <div className="editor-card">
              <h2>Select an entry</h2>
              <p className="editor-muted">Choose an exact-locale entry or create one.</p>
            </div>
          ) : draft.isPending || form.isPending ? (
            <p>Loading current draft…</p>
          ) : draft.isError || form.isError || definition === null ? (
            <div className="editor-card" role="alert">
              The current role-projected form or draft could not be loaded.
            </div>
          ) : (
            <>
              <section className="editor-card editor-stack" aria-labelledby="entry-name-heading">
                <h2 id="entry-name-heading">{draft.data.entry.displayName}</h2>
                <form
                  className="editor-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename.mutate();
                  }}
                >
                  <label className="editor-field">
                    <span className="editor-legend">Display name</span>
                    <input
                      className="editor-input"
                      value={renameValue}
                      maxLength={100}
                      disabled={!editingEnabled || rename.isPending}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                  </label>
                  <button
                    className="editor-button"
                    type="submit"
                    disabled={
                      !editingEnabled ||
                      rename.isPending ||
                      renameValue.trim() === draft.data.entry.displayName
                    }
                  >
                    Rename
                  </button>
                </form>
              </section>

              {draft.data.validation.issues.length > 0 ? (
                <section className="editor-banner" aria-labelledby="validation-heading">
                  <h3 id="validation-heading">Server validation</h3>
                  <ul className="editor-issues">
                    {draft.data.validation.issues.map((issue, index) => (
                      <li key={`${issue.scope}-${issue.path}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                  {draft.data.validation.capped ? <p>Additional issues were capped.</p> : null}
                </section>
              ) : null}

              {publicationIssues.length > 0 ? (
                <section className="editor-banner" aria-labelledby="publication-issues-heading">
                  <h3 id="publication-issues-heading">Publication validation</h3>
                  <ul className="editor-issues">
                    {publicationIssues.map((issue, index) => (
                      <li key={`${issue.code}-${issue.path}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {sharedDefinition !== null && sharedDefinition.fields.length > 0 ? (
                <section className="editor-card" aria-labelledby="shared-heading">
                  <h3 id="shared-heading">Shared content</h3>
                  <Suspense fallback={<p>Loading shared form…</p>}>
                    <ContentForm
                      definition={sharedDefinition}
                      values={sharedValues}
                      onValuesChange={setSharedValues}
                      onSubmit={() => save.mutate()}
                      submitLabel="Save draft"
                      statusMessage="Shared values apply across locales. Server validation remains authoritative."
                      submitting={save.isPending}
                    />
                  </Suspense>
                </section>
              ) : null}

              {localizedDefinition !== null && localizedDefinition.fields.length > 0 ? (
                <section className="editor-card" aria-labelledby="localized-heading">
                  <h3 id="localized-heading">Localized content · {locale}</h3>
                  <Suspense fallback={<p>Loading localized form…</p>}>
                    <ContentForm
                      definition={localizedDefinition}
                      values={localizedValues}
                      onValuesChange={setLocalizedValues}
                      onSubmit={() => save.mutate()}
                      submitLabel="Save draft"
                      statusMessage="Only this exact locale is changed. Server validation remains authoritative."
                      submitting={save.isPending}
                    />
                  </Suspense>
                </section>
              ) : null}

              <section className="editor-card editor-stack" aria-labelledby="preview-heading">
                <h3 id="preview-heading">Preview link</h3>
                <label className="editor-field">
                  <span className="editor-legend">URL template</span>
                  <input
                    className="editor-input"
                    value={previewTemplate}
                    placeholder="https://localhost:3000/preview/{collection}/{entry}?locale={locale}"
                    onChange={(event) => {
                      setPreviewTemplate(event.target.value);
                      writePreviewTemplate(event.target.value);
                    }}
                  />
                </label>
                <p className="editor-muted">
                  The template is stored only in this browser. Tokens are never appended.
                </p>
                {preview !== null ? (
                  <a href={preview} target="_blank" rel="noreferrer">
                    Open Preview
                  </a>
                ) : null}
              </section>

              <div className="editor-actions" aria-label="Entry actions">
                <button
                  className="editor-button editor-button-primary"
                  type="button"
                  disabled={!editingEnabled || !dirty || busy}
                  onClick={() => save.mutate()}
                >
                  Save draft
                </button>
                <button className="editor-button" type="button" disabled={busy} onClick={reload}>
                  Reload current
                </button>
                <button
                  className="editor-button"
                  type="button"
                  disabled={!editingEnabled || dirty || busy}
                  onClick={() => publish.mutate()}
                >
                  Validate and publish {locale}
                </button>
                <button
                  className="editor-button"
                  type="button"
                  disabled={
                    !editingEnabled || dirty || busy || publication.data?.state !== "published"
                  }
                  onClick={() => unpublish.mutate()}
                >
                  Unpublish {locale}
                </button>
              </div>
              <p className="editor-status" role="status">
                {notice}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

const root = document.querySelector("#editor-root");
if (root === null) throw new Error("EDITOR_ROOT_MISSING");

initializeSession()
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <EditorApp />
        </QueryClientProvider>
      </StrictMode>,
    );
  })
  .catch(() => {
    root.textContent =
      "The secure editor session could not start. Close this tab and run ffd editor again.";
  });
