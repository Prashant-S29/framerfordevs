import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@framerfordevs/ui/components/button";
import { Input } from "@framerfordevs/ui/components/input";

import {
  contentErrorMessage,
  contentQueryKeys,
  contentRetryDelay,
  normalizeStudioSearch,
  retryContentQuery,
  useContentRetryCountdown,
  useStudioContentClient,
  useStudioContentContext,
} from "./data";

export { CollectionLayout } from "./layout";

function ContentFailure({
  error,
  onRetry,
}: {
  readonly error: Error | null;
  readonly onRetry: () => void;
}) {
  const retryCountdown = useContentRetryCountdown(error);
  return (
    <div className="studio-panel" role="alert">
      <h2>Content unavailable</h2>
      <p>{contentErrorMessage(error)}</p>
      <Button type="button" variant="outline" disabled={retryCountdown > 0} onClick={onRetry}>
        {retryCountdown > 0 ? `Try again in ${retryCountdown}s` : "Try again"}
      </Button>
    </div>
  );
}

export function ContentIndex() {
  const context = useStudioContentContext();
  if (context.isPending) return <p role="status">Loading content access…</p>;
  if (context.isError)
    return <ContentFailure error={context.error} onRetry={() => void context.refetch()} />;

  return (
    <section className="studio-stack" aria-labelledby="content-heading">
      <div>
        <p className="studio-eyebrow">Content</p>
        <h2 id="content-heading">Choose a collection and locale</h2>
        <p className="studio-muted">Only content you are authorized to read is shown.</p>
      </div>
      {context.data.collections.length === 0 || context.data.locales.length === 0 ? (
        <div className="studio-panel">
          <h3>No content is available</h3>
          <p>Ask a project administrator to grant content and locale access.</p>
        </div>
      ) : (
        <div className="studio-card-grid">
          {context.data.collections.map((collection) => (
            <article className="studio-panel" key={collection.id}>
              <h3>{collection.displayName}</h3>
              <ul className="studio-link-list" aria-label={`${collection.displayName} locales`}>
                {context.data.locales.map((locale) => (
                  <li key={locale.id}>
                    <Link
                      to="/content/$collectionId/locales/$locale"
                      params={{ collectionId: collection.id, locale: locale.tag }}
                    >
                      {locale.displayName} ({locale.tag})
                    </Link>
                  </li>
                ))}
              </ul>
              {collection.capabilities.canPublishPresentation ? (
                <Link to="/content/$collectionId/layout" params={{ collectionId: collection.id }}>
                  Edit form layout
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {context.data.configurationNotices.length > 0 ? (
        <div className="studio-panel" role="status">
          <h3>Some collections need configuration</h3>
          <ul>
            {context.data.configurationNotices.map((notice) => (
              <li key={notice.collectionId}>
                {notice.displayName}:{" "}
                {notice.reason === "empty_schema" ? "empty model" : "invalid form projection"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function useDebouncedSearch(input: string) {
  const [search, setSearch] = useState("");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const normalized = normalizeStudioSearch(input);
      setSearch((current) => {
        if (current !== normalized) setGeneration((value) => value + 1);
        return normalized;
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [input]);
  return { search, generation };
}

export function CollectionContent() {
  const { collectionId = "", locale = "" } = useParams({ strict: false });
  const context = useStudioContentContext();
  const client = useStudioContentClient();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const { search, generation } = useDebouncedSearch(searchInput);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<ReadonlyArray<string | null>>([null]);
  const previousGeneration = useRef(generation);
  const mode = search.length >= 2 ? "search" : "browse";
  const cursor = cursors[page] ?? null;

  useEffect(() => {
    if (previousGeneration.current === generation) return;
    previousGeneration.current = generation;
    setPage(0);
    setCursors([null]);
    queryClient.removeQueries({
      queryKey: ["studio", "content", "entries", collectionId, locale],
    });
  }, [collectionId, generation, locale, queryClient]);

  const routeScope = useMemo(() => {
    if (!context.data) return undefined;
    const collection = context.data.collections.find((item) => item.id === collectionId);
    const localeAccess = context.data.locales.find((item) => item.tag === locale);
    return collection && localeAccess ? { collection, localeAccess } : undefined;
  }, [collectionId, context.data, locale]);

  const entries = useQuery({
    queryKey: contentQueryKeys.entries(collectionId, locale, mode, generation, page, cursor),
    queryFn: ({ signal }) =>
      mode === "search"
        ? client.search({ collectionId, locale }, { query: search, cursor, limit: 25 }, signal)
        : client.browse({ collectionId, locale }, { cursor, limit: 25 }, signal),
    enabled: routeScope !== undefined,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 10_000,
    gcTime: 60_000,
  });

  if (context.isPending) return <p role="status">Loading content access…</p>;
  if (context.isError)
    return <ContentFailure error={context.error} onRetry={() => void context.refetch()} />;
  if (routeScope === undefined) {
    return (
      <div className="studio-panel" role="alert">
        <h2>Content route unavailable</h2>
        <p>The collection or locale is unavailable, or you no longer have access.</p>
        <Link to="/content">Choose content</Link>
      </div>
    );
  }

  const advance = () => {
    if (!entries.data?.nextCursor || page >= 19) return;
    setCursors((current) => [...current.slice(0, page + 1), entries.data.nextCursor]);
    setPage((current) => current + 1);
  };

  return (
    <section className="studio-stack" aria-labelledby="entries-heading">
      <div className="studio-breadcrumbs">
        <Link to="/content">Content</Link>
        <span aria-hidden="true">/</span>
        <span>{routeScope.collection.displayName}</span>
        <span aria-hidden="true">/</span>
        <span>{routeScope.localeAccess.displayName}</span>
      </div>
      <div className="studio-content-heading">
        <div>
          <h2 id="entries-heading">{routeScope.collection.displayName}</h2>
          <p className="studio-muted">
            {routeScope.localeAccess.displayName} ({locale})
          </p>
        </div>
        {routeScope.collection.capabilities.canCreate ? (
          <Link
            className="studio-primary-link"
            to="/content/$collectionId/locales/$locale/entries/new"
            params={{ collectionId, locale }}
          >
            Create entry
          </Link>
        ) : null}
      </div>
      <label className="studio-search">
        <span>Search entries</span>
        <Input
          type="search"
          value={searchInput}
          maxLength={100}
          autoComplete="off"
          placeholder="Enter at least 2 characters"
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </label>
      {entries.isPending ? <p role="status">Loading entries…</p> : null}
      {entries.isError ? (
        <ContentFailure error={entries.error} onRetry={() => void entries.refetch()} />
      ) : null}
      {entries.data ? (
        <>
          <p className="studio-muted" aria-live="polite">
            {entries.data.count.value.toLocaleString()}
            {entries.data.count.relation === "at_least" ? "+" : ""}{" "}
            {mode === "search" ? "matching " : ""}entries
          </p>
          {entries.data.items.length === 0 ? (
            <div className="studio-panel">
              <h3>{mode === "search" ? "No matching entries" : "No entries yet"}</h3>
              <p>{mode === "search" ? "Try another search." : "Create an entry to get started."}</p>
            </div>
          ) : (
            <ul className="studio-entry-list">
              {entries.data.items.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to="/content/$collectionId/locales/$locale/entries/$entryId"
                    params={{ collectionId, locale, entryId: entry.id }}
                  >
                    <strong>{entry.displayName}</strong>
                    <span>Updated {new Date(entry.updatedAt).toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <nav className="studio-pagination" aria-label="Entry pages">
            <Button
              type="button"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <span>Page {page + 1}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!entries.data.hasMore || page >= 19}
              onClick={advance}
            >
              Next
            </Button>
          </nav>
          {page >= 19 && entries.data.hasMore ? (
            <p className="studio-muted">Refine your search to view more entries.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
