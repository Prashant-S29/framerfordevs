import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@framerfordevs/ui/components/button";
import { Input } from "@framerfordevs/ui/components/input";
import type { ContentReferencePickerProps } from "@framerfordevs/content-form";

import {
  contentErrorMessage,
  contentQueryKeys,
  contentRetryDelay,
  normalizeStudioSearch,
  retryContentQuery,
  useStudioContentClient,
} from "./data";

interface ReferenceSelection {
  readonly targetCollectionId: string;
  readonly entryId: string;
}

interface ReferenceResolutionContextValue {
  readonly register: (owner: string, selection: ReferenceSelection | null) => void;
  readonly labels: ReadonlyMap<string, string | null>;
}

const ReferenceResolutionContext = createContext<ReferenceResolutionContextValue | null>(null);

function ResolutionBatch({
  collectionId,
  locale,
  entryIds,
  generation,
  index,
  enabled,
  onResolved,
  onSettled,
}: {
  readonly collectionId: string;
  readonly locale: string;
  readonly entryIds: ReadonlyArray<string>;
  readonly generation: number;
  readonly index: number;
  readonly enabled: boolean;
  readonly onResolved: (
    entryIds: ReadonlyArray<string>,
    labels: ReadonlyMap<string, string>,
  ) => void;
  readonly onSettled: (index: number) => void;
}) {
  const client = useStudioContentClient();
  const settled = useRef(false);
  const query = useQuery({
    queryKey: contentQueryKeys.references(
      collectionId,
      locale,
      `batch-${index}`,
      "resolve",
      generation,
    ),
    queryFn: ({ signal }) => client.resolve({ collectionId, locale }, entryIds, signal),
    enabled,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    settled.current = false;
  }, [generation]);
  useEffect(() => {
    if (!query.data) return;
    onResolved(entryIds, new Map(query.data.items.map((item) => [item.id, item.displayName])));
  }, [entryIds, onResolved, query.data]);
  useEffect(() => {
    if (!enabled || settled.current || (!query.isSuccess && !query.isError)) return;
    settled.current = true;
    onSettled(index);
  }, [enabled, index, onSettled, query.isError, query.isSuccess]);
  return null;
}

export function StudioReferenceResolutionProvider({
  locale,
  children,
}: {
  readonly locale: string;
  readonly children: ReactNode;
}) {
  const [selections, setSelections] = useState<ReadonlyMap<string, ReferenceSelection>>(new Map());
  const [labels, setLabels] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [generation, setGeneration] = useState(0);
  const [activeCount, setActiveCount] = useState(4);
  const register = useCallback((owner: string, selection: ReferenceSelection | null) => {
    setGeneration((value) => value + 1);
    setActiveCount(4);
    setSelections((current) => {
      const previous = current.get(owner);
      if (
        (selection === null && previous === undefined) ||
        (selection !== null &&
          previous?.entryId === selection.entryId &&
          previous.targetCollectionId === selection.targetCollectionId)
      ) {
        return current;
      }
      const next = new Map(current);
      if (selection === null) next.delete(owner);
      else next.set(owner, selection);
      return next;
    });
  }, []);
  const batches = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    for (const selection of selections.values()) {
      const ids = grouped.get(selection.targetCollectionId) ?? new Set<string>();
      ids.add(selection.entryId);
      grouped.set(selection.targetCollectionId, ids);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([collectionId, ids]) => {
        const ordered = [...ids];
        return Array.from({ length: Math.ceil(ordered.length / 100) }, (_, index) => ({
          collectionId,
          entryIds: ordered.slice(index * 100, index * 100 + 100),
        }));
      });
  }, [selections]);
  const onResolved = useCallback(
    (entryIds: ReadonlyArray<string>, resolved: ReadonlyMap<string, string>) =>
      setLabels((current) => {
        const next = new Map(current);
        for (const id of entryIds) next.set(id, resolved.get(id) ?? null);
        return next;
      }),
    [],
  );
  const onSettled = useCallback(
    (_index: number) => setActiveCount((current) => Math.min(batches.length, current + 1)),
    [batches.length],
  );
  const context = useMemo(() => ({ register, labels }), [labels, register]);

  return (
    <ReferenceResolutionContext.Provider value={context}>
      {children}
      {batches.map((batch, index) => (
        <ResolutionBatch
          key={`${generation}-${batch.collectionId}-${index}`}
          {...batch}
          locale={locale}
          generation={generation}
          index={index}
          enabled={index < activeCount}
          onResolved={onResolved}
          onSettled={onSettled}
        />
      ))}
    </ReferenceResolutionContext.Provider>
  );
}

export interface StudioReferencePickerProps extends ContentReferencePickerProps {
  readonly locale: string;
}

export function StudioReferencePicker({
  controlId,
  ariaDescribedBy,
  field,
  value,
  disabled,
  locale,
  onChange,
}: StudioReferencePickerProps) {
  const client = useStudioContentClient();
  const queryClient = useQueryClient();
  const resolution = useContext(ReferenceResolutionContext);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchGeneration, setSearchGeneration] = useState(0);
  const [remembered, setRemembered] = useState<{
    readonly id: string;
    readonly label: string;
  } | null>(null);
  const ownerKey = useId();
  const targetCollectionId = field.configuration.targetCollectionId;
  const registerReference = resolution?.register;

  useEffect(() => {
    registerReference?.(ownerKey, value === null ? null : { targetCollectionId, entryId: value });
    return () => registerReference?.(ownerKey, null);
  }, [ownerKey, registerReference, targetCollectionId, value]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalized = normalizeStudioSearch(input);
      setSearch((current) => {
        if (current !== normalized) setSearchGeneration((generation) => generation + 1);
        return normalized;
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [input]);
  useEffect(
    () => () => {
      queryClient.removeQueries({
        queryKey: ["studio", "content", "references", targetCollectionId, locale, ownerKey],
      });
    },
    [locale, ownerKey, queryClient, targetCollectionId],
  );

  const results = useQuery({
    queryKey: contentQueryKeys.references(
      targetCollectionId,
      locale,
      ownerKey,
      "search",
      searchGeneration,
    ),
    queryFn: ({ signal }) =>
      client.search(
        { collectionId: targetCollectionId, locale },
        { query: search, cursor: null, limit: 20 },
        signal,
      ),
    enabled: open && search.length >= 2,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 0,
    gcTime: 0,
  });
  const resolvedLabel =
    value !== null && remembered?.id === value
      ? remembered.label
      : value === null
        ? "No reference selected"
        : resolution?.labels.get(value);
  const loading = value !== null && resolvedLabel === undefined;

  return (
    <div className="studio-reference-picker">
      <div className="studio-reference-current" aria-live="polite">
        {loading ? "Loading selected reference…" : (resolvedLabel ?? "Unavailable reference")}
      </div>
      <div className="studio-inline-actions">
        <Button
          id={controlId}
          type="button"
          variant="outline"
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          {value === null ? "Choose reference" : "Change reference"}
        </Button>
        {value !== null ? (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setRemembered(null);
              onChange(undefined);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="studio-reference-results">
          <label>
            <span>Search {field.displayLabel ?? "references"}</span>
            <Input
              type="search"
              autoComplete="off"
              maxLength={100}
              value={input}
              placeholder="Enter at least 2 characters"
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          {search.length < 2 ? <p className="studio-muted">Enter at least 2 characters.</p> : null}
          {results.isPending && search.length >= 2 ? (
            <p role="status">Searching references…</p>
          ) : null}
          {results.isError ? <p role="alert">{contentErrorMessage(results.error)}</p> : null}
          {results.data ? (
            results.data.items.length === 0 ? (
              <p>No available references found.</p>
            ) : (
              <ul className="studio-reference-list">
                {results.data.items.map((entry) => (
                  <li key={entry.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setRemembered({ id: entry.id, label: entry.displayName });
                        onChange(entry.id);
                        setOpen(false);
                        setInput("");
                      }}
                    >
                      {entry.displayName}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
