import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@framerfordevs/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@framerfordevs/ui/components/alert/dialog";

import { StudioContentClientError } from "../../../../content-client";
import {
  studioContentBrowserLimits,
  type StudioFormDto,
  type StudioJsonObject,
  type StudioRevisionScope,
  type StudioRevisionSummaryDto,
} from "../../../../contracts/content";
import {
  contentErrorMessage,
  contentQueryKeys,
  contentRetryDelay,
  retryContentQuery,
  useStudioContentClient,
} from "../../data";
import {
  formatStudioValue,
  studioChangedFieldSummary,
  studioComparisonChangeLabel,
  studioFieldLabels,
  studioRevisionAuthor,
  studioRevisionRestoreBlocker,
} from "..";

export interface StudioHistoryPanelProps {
  readonly collectionId: string;
  readonly locale: string;
  readonly localeLabel: string;
  readonly entryId: string;
  readonly currentUserId: string;
  readonly form: StudioFormDto;
  readonly visibleFieldIds: ReadonlySet<string>;
  readonly headRevisionIds: Readonly<Record<StudioRevisionScope, string | null>>;
  readonly versions: Readonly<Record<StudioRevisionScope, number>>;
  readonly canRestore: Readonly<Record<StudioRevisionScope, boolean>>;
  readonly dirty: boolean;
  readonly onRestored: (message: string) => Promise<unknown>;
  readonly onReloadLatest: () => Promise<unknown>;
  readonly onPreview?: (revision: StudioRevisionSummaryDto) => void;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function reloadRecovery(error: Error | null): boolean {
  return (
    error instanceof StudioContentClientError &&
    (error.code === "DRAFT_VERSION_CONFLICT" || error.code === "STALE_SCHEMA")
  );
}

function ambiguous(error: Error | null): boolean {
  return (
    error instanceof StudioContentClientError &&
    (error.status === 503 || (error.status === 0 && error.retryable))
  );
}

interface RevisionListProps extends StudioHistoryPanelProps {
  readonly scope: StudioRevisionScope;
  readonly labels: ReadonlyMap<string, string>;
  readonly onView: (revision: StudioRevisionSummaryDto) => void;
  readonly onCompare: (revision: StudioRevisionSummaryDto) => void;
  readonly onRestore: (revision: StudioRevisionSummaryDto) => void;
}

function RevisionList(props: RevisionListProps) {
  const client = useStudioContentClient();
  const scopeLabel = props.scope === "shared" ? "shared" : props.localeLabel;
  const revisions = useInfiniteQuery({
    queryKey: contentQueryKeys.revisions(
      props.collectionId,
      props.locale,
      props.entryId,
      props.scope,
    ),
    queryFn: ({ pageParam, signal }) =>
      client.revisions(
        { collectionId: props.collectionId, locale: props.locale, entryId: props.entryId },
        {
          scope: props.scope,
          cursor: pageParam,
          limit: studioContentBrowserLimits.historyPageLimit,
        },
        props.visibleFieldIds,
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
  });
  if (revisions.isPending) return <p role="status">Loading {scopeLabel} history…</p>;
  if (revisions.isError) {
    return (
      <div role="alert">
        <p>{contentErrorMessage(revisions.error)}</p>
        <Button type="button" variant="outline" onClick={() => void revisions.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const items = revisions.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <p className="studio-muted">No {scopeLabel} revisions yet.</p>;
  const head = props.headRevisionIds[props.scope];
  return (
    <>
      <ol className="studio-history-list" aria-label={`${scopeLabel} revisions`}>
        {items.map((revision) => {
          const blocker = studioRevisionRestoreBlocker({
            revision,
            headRevisionId: head,
            dirty: props.dirty,
          });
          const blockerId = `studio-restore-blocker-${revision.id}`;
          return (
            <li key={revision.id} className="studio-history-item">
              <div>
                <strong>
                  Revision {revision.sequence}
                  {revision.id === head ? " (current draft)" : ""}
                </strong>
                <span>
                  {studioRevisionAuthor(revision, props.currentUserId)} ·{" "}
                  <time dateTime={revision.authoredAt}>{formatTime(revision.authoredAt)}</time>
                </span>
                <span>{studioChangedFieldSummary(revision, props.labels)}</span>
                {revision.restoredFromRevisionId !== null ? (
                  <span>Restored from an earlier revision.</span>
                ) : null}
                {!revision.compatible ? <span>Uses an older content model.</span> : null}
              </div>
              <div className="studio-inline-actions">
                <Button type="button" variant="outline" onClick={() => props.onView(revision)}>
                  View revision {revision.sequence}
                </Button>
                {props.onPreview === undefined ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => props.onPreview?.(revision)}
                  >
                    Preview revision {revision.sequence}
                  </Button>
                )}
                {head !== null && revision.id !== head ? (
                  <Button type="button" variant="outline" onClick={() => props.onCompare(revision)}>
                    Compare revision {revision.sequence} with current draft
                  </Button>
                ) : null}
                {props.canRestore[props.scope] && revision.id !== head ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={blocker !== null}
                      aria-describedby={blocker === null ? undefined : blockerId}
                      onClick={() => props.onRestore(revision)}
                    >
                      Restore revision {revision.sequence}
                    </Button>
                    {blocker !== null ? (
                      <span id={blockerId} className="studio-muted">
                        {blocker}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {revisions.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          disabled={revisions.isFetchingNextPage}
          onClick={() => void revisions.fetchNextPage()}
        >
          {revisions.isFetchingNextPage ? "Loading older revisions…" : "Show older revisions"}
        </Button>
      ) : null}
    </>
  );
}

function RevisionValues({
  revision,
  props,
  labels,
}: {
  readonly revision: StudioRevisionSummaryDto;
  readonly props: StudioHistoryPanelProps;
  readonly labels: ReadonlyMap<string, string>;
}) {
  const client = useStudioContentClient();
  const detail = useQuery({
    queryKey: [
      ...contentQueryKeys.entryRevisions(props.collectionId, props.locale, props.entryId),
      "detail",
      revision.id,
    ],
    queryFn: ({ signal }) =>
      client.revision(
        { collectionId: props.collectionId, locale: props.locale, entryId: props.entryId },
        revision.id,
        props.visibleFieldIds,
        signal,
      ),
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (detail.isPending) return <p role="status">Loading revision values…</p>;
  if (detail.isError) return <p role="alert">{contentErrorMessage(detail.error)}</p>;
  const fields = props.form.fields.filter((field) => field.id in detail.data.values);
  if (fields.length === 0) return <p>This revision has no values in fields you can view.</p>;
  return (
    <dl className="studio-history-values">
      {fields.map((field) => (
        <div key={field.id}>
          <dt>{labels.get(field.id) ?? "Field"}</dt>
          <dd>{formatStudioValue(detail.data.values[field.id])}</dd>
        </div>
      ))}
    </dl>
  );
}

function RevisionComparison({
  revision,
  headRevisionId,
  props,
  labels,
}: {
  readonly revision: StudioRevisionSummaryDto;
  readonly headRevisionId: string;
  readonly props: StudioHistoryPanelProps;
  readonly labels: ReadonlyMap<string, string>;
}) {
  const client = useStudioContentClient();
  const comparison = useQuery({
    queryKey: [
      ...contentQueryKeys.entryRevisions(props.collectionId, props.locale, props.entryId),
      "compare",
      revision.id,
      headRevisionId,
    ],
    queryFn: ({ signal }) =>
      client.compare(
        { collectionId: props.collectionId, locale: props.locale, entryId: props.entryId },
        { fromRevisionId: revision.id, toRevisionId: headRevisionId },
        props.visibleFieldIds,
        signal,
      ),
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (comparison.isPending) return <p role="status">Comparing revisions…</p>;
  if (comparison.isError) return <p role="alert">{contentErrorMessage(comparison.error)}</p>;
  const data = comparison.data;
  return (
    <div className="studio-stack">
      {data.schemaDiffers ? <p>These revisions use different content models.</p> : null}
      {data.restrictedChanges ? <p>Some changes are in fields you cannot view.</p> : null}
      {data.items.length === 0 ? (
        <p>There are no differences in fields you can view.</p>
      ) : (
        <ul className="studio-history-values" aria-label="Field differences">
          {data.items.map((item) => (
            <li key={item.fieldId}>
              <strong>
                {item.inCurrentSchema
                  ? (labels.get(item.fieldId) ?? "Field")
                  : "A field that is no longer in the content model"}
              </strong>
              <span>{studioComparisonChangeLabel(item.change)}</span>
              <span>
                Revision {revision.sequence}: {formatStudioValue(item.before)}
              </span>
              <span>Current draft: {formatStudioValue(item.after)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const scopes = ["localized", "shared"] as const;

function ScopeTabs({
  regionId,
  scope,
  localeLabel,
  onChange,
}: {
  readonly regionId: string;
  readonly scope: StudioRevisionScope;
  readonly localeLabel: string;
  readonly onChange: (scope: StudioRevisionScope) => void;
}) {
  const buttons = useRef(new Map<StudioRevisionScope, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? scopes[0]
        : event.key === "End"
          ? scopes[1]
          : scope === "localized"
            ? "shared"
            : "localized";
    onChange(next);
    buttons.current.get(next)?.focus();
  };
  return (
    <div className="studio-locale-tabs" role="tablist" aria-label="Revision scope">
      {scopes.map((candidate) => (
        <button
          key={candidate}
          ref={(element) => {
            if (element) buttons.current.set(candidate, element);
            else buttons.current.delete(candidate);
          }}
          type="button"
          role="tab"
          id={`${regionId}-${candidate}-tab`}
          aria-selected={scope === candidate}
          aria-controls={scope === candidate ? `${regionId}-${candidate}-panel` : undefined}
          tabIndex={scope === candidate ? 0 : -1}
          onClick={() => onChange(candidate)}
          onKeyDown={onKeyDown}
        >
          {candidate === "shared" ? "Shared" : localeLabel}
        </button>
      ))}
    </div>
  );
}

export function StudioHistoryPanel(props: StudioHistoryPanelProps) {
  const client = useStudioContentClient();
  const queryClient = useQueryClient();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<StudioRevisionScope>("localized");
  const [viewing, setViewing] = useState<StudioRevisionSummaryDto | null>(null);
  const [comparing, setComparing] = useState<StudioRevisionSummaryDto | null>(null);
  const [restoring, setRestoring] = useState<StudioRevisionSummaryDto | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    readonly revision: StudioRevisionSummaryDto;
    readonly body: StudioJsonObject;
  } | null>(null);
  const labels = useMemo(() => studioFieldLabels(props.form), [props.form]);
  const restore = useMutation({
    mutationFn: (input: {
      readonly revision: StudioRevisionSummaryDto;
      readonly body: StudioJsonObject;
    }) =>
      client.restore(
        { collectionId: props.collectionId, locale: props.locale, entryId: props.entryId },
        input.revision.id,
        input.body,
        props.visibleFieldIds,
        new AbortController().signal,
      ),
    retry: false,
    onSuccess: async (_receipt, input) => {
      setPendingRestore(null);
      setRestoring(null);
      await queryClient.invalidateQueries({
        queryKey: contentQueryKeys.entryRevisions(props.collectionId, props.locale, props.entryId),
        refetchType: "none",
      });
      await props.onRestored(
        `Revision ${input.revision.sequence} restored as the current ${
          input.revision.scope === "shared" ? "shared" : props.localeLabel
        } draft. Publication did not change.`,
      );
    },
    onError: (_error, input) => {
      setPendingRestore(input);
      setRestoring(null);
    },
  });
  const confirmRestore = () => {
    if (restoring === null) return;
    restore.mutate({
      revision: restoring,
      body: {
        scope: restoring.scope,
        schemaRevisionId: props.form.schemaRevisionId,
        contractHash: props.form.contractHash,
        expectedVersion: props.versions[restoring.scope],
        commandId: crypto.randomUUID(),
      },
    });
  };
  const comparingHead = comparing === null ? null : props.headRevisionIds[comparing.scope];

  return (
    <section className="studio-panel studio-history" aria-labelledby={`${regionId}-heading`}>
      <div className="studio-inline-actions">
        <h3 id={`${regionId}-heading`}>History</h3>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={`${regionId}-region`}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide history" : "Show history"}
        </Button>
      </div>
      {restore.isError ? (
        <div role="alert">
          <p>{contentErrorMessage(restore.error)}</p>
          <div className="studio-inline-actions">
            {reloadRecovery(restore.error) ? (
              <Button type="button" variant="outline" onClick={() => void props.onReloadLatest()}>
                Reload latest draft
              </Button>
            ) : null}
            {pendingRestore !== null && ambiguous(restore.error) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => restore.mutate(pendingRestore)}
              >
                Retry the exact restore request
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {open ? (
        <div id={`${regionId}-region`}>
          <ScopeTabs
            regionId={regionId}
            scope={scope}
            localeLabel={props.localeLabel}
            onChange={setScope}
          />
          <div
            role="tabpanel"
            id={`${regionId}-${scope}-panel`}
            aria-labelledby={`${regionId}-${scope}-tab`}
          >
            <RevisionList
              key={scope}
              {...props}
              scope={scope}
              labels={labels}
              onView={setViewing}
              onCompare={setComparing}
              onRestore={(revision) => {
                restore.reset();
                setRestoring(revision);
              }}
            />
          </div>
        </div>
      ) : null}
      <Dialog open={viewing !== null} onOpenChange={(next) => (next ? null : setViewing(null))}>
        <DialogContent className="studio-history-dialog">
          <DialogHeader>
            <DialogTitle>Revision {viewing?.sequence}</DialogTitle>
            <DialogDescription>
              A read-only view of the values that you can see in this revision.
            </DialogDescription>
          </DialogHeader>
          {viewing !== null ? (
            <RevisionValues revision={viewing} props={props} labels={labels} />
          ) : null}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
      <Dialog open={comparing !== null} onOpenChange={(next) => (next ? null : setComparing(null))}>
        <DialogContent className="studio-history-dialog">
          <DialogHeader>
            <DialogTitle>Compare revision {comparing?.sequence} with current draft</DialogTitle>
            <DialogDescription>
              Differences in fields you can see, from the selected revision to the saved draft.
            </DialogDescription>
          </DialogHeader>
          {comparing !== null && comparingHead !== null ? (
            <RevisionComparison
              revision={comparing}
              headRevisionId={comparingHead}
              props={props}
              labels={labels}
            />
          ) : null}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
      <AlertDialog open={restoring !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore revision {restoring?.sequence}?</AlertDialogTitle>
            <AlertDialogDescription>
              Studio saves the values of this revision as a new{" "}
              {restoring?.scope === "shared" ? "shared" : props.localeLabel} draft revision. Earlier
              revisions stay in history. Publication does not change until you publish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRestoring(null)}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={restore.isPending} onClick={confirmRestore}>
              {restore.isPending ? "Restoring…" : "Restore revision"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
