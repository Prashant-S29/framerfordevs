import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@framerfordevs/ui/components/button";
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
import type {
  StudioFormDto,
  StudioJsonObject,
  StudioPublicationPlanDto,
  StudioPublicationStatusDto,
} from "../../../../contracts/content";
import { contentErrorMessage, contentQueryKeys, useStudioContentClient } from "../../data";
import { studioFieldLabels } from "../../history";
import {
  studioPlanIsPublishable,
  studioPublishBody,
  studioPublishMessage,
  studioUnpublishBody,
  studioUnpublishMessage,
} from "..";
import { StudioPublicationBadge } from "../badge";

export interface StudioPublicationPanelProps {
  readonly collectionId: string;
  readonly locale: string;
  readonly localeLabel: string;
  readonly entryId: string;
  readonly form: StudioFormDto;
  readonly visibleFieldIds: ReadonlySet<string>;
  readonly status: StudioPublicationStatusDto;
  readonly dirty: boolean;
  readonly onReloadLatest: () => Promise<unknown>;
}

function ambiguous(error: Error | null): boolean {
  return (
    error instanceof StudioContentClientError &&
    (error.status === 503 || (error.status === 0 && error.retryable))
  );
}

function errorCode(error: Error | null): string | null {
  return error instanceof StudioContentClientError ? error.code : null;
}

export function StudioPublicationPanel(props: StudioPublicationPanelProps) {
  const client = useStudioContentClient();
  const queryClient = useQueryClient();
  const headingId = useId();
  const labels = useMemo(() => studioFieldLabels(props.form), [props.form]);
  const scope = { collectionId: props.collectionId, locale: props.locale, entryId: props.entryId };
  const [plan, setPlan] = useState<StudioPublicationPlanDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [pending, setPending] = useState<{
    readonly kind: "publish" | "unpublish";
    readonly body: StudioJsonObject;
  } | null>(null);

  const refreshStatus = () =>
    queryClient.invalidateQueries({
      queryKey: contentQueryKeys.publication(props.collectionId, props.locale, props.entryId),
    });
  const validate = useMutation({
    mutationFn: () =>
      client.validatePublication(scope, props.visibleFieldIds, new AbortController().signal),
    retry: false,
    onMutate: () => {
      setNotice(null);
      setPlan(null);
    },
    onSuccess: (result) => setPlan(result),
  });
  const command = useMutation({
    mutationFn: async (input: {
      readonly kind: "publish" | "unpublish";
      readonly body: StudioJsonObject;
    }) => {
      const signal = new AbortController().signal;
      if (input.kind === "publish") {
        const result = await client.publish(scope, input.body, props.visibleFieldIds, signal);
        return studioPublishMessage(result, props.localeLabel);
      }
      const result = await client.unpublish(scope, input.body, signal);
      return studioUnpublishMessage(result, props.localeLabel);
    },
    retry: false,
    onMutate: (input) => {
      setPending(input);
      setNotice(null);
    },
    onSuccess: async (message) => {
      setPending(null);
      setPlan(null);
      setConfirmUnpublish(false);
      setNotice(message);
      await refreshStatus();
    },
    onError: () => setConfirmUnpublish(false),
  });

  const publishable = plan !== null && studioPlanIsPublishable(plan);
  const failureCode = errorCode(command.error);
  const publishBlocked = props.dirty
    ? "Save your changes before you publish. Publishing uses the saved draft."
    : null;
  const blockerId = `${headingId}-blocked`;

  return (
    <section className="studio-panel studio-publication" aria-labelledby={headingId}>
      <div className="studio-inline-actions">
        <h3 id={headingId}>Publication</h3>
        <StudioPublicationBadge status={props.status} />
      </div>
      {props.status.currentPublication !== null ? (
        <p className="studio-muted">
          Publication {props.status.currentPublication.sequence} went live{" "}
          <time dateTime={props.status.currentPublication.publishedAt}>
            {new Date(props.status.currentPublication.publishedAt).toLocaleString()}
          </time>
          .
        </p>
      ) : null}
      <div className="studio-inline-actions">
        <Button
          type="button"
          variant="outline"
          disabled={validate.isPending || command.isPending || publishBlocked !== null}
          aria-describedby={publishBlocked === null ? undefined : blockerId}
          onClick={() => validate.mutate()}
        >
          {validate.isPending ? "Checking…" : "Check publication"}
        </Button>
        {props.status.state === "published" ? (
          <Button
            type="button"
            variant="outline"
            disabled={command.isPending}
            onClick={() => {
              command.reset();
              setConfirmUnpublish(true);
            }}
          >
            Unpublish {props.localeLabel}
          </Button>
        ) : null}
      </div>
      {publishBlocked !== null ? (
        <p id={blockerId} className="studio-muted">
          {publishBlocked}
        </p>
      ) : null}
      {validate.isError ? <p role="alert">{contentErrorMessage(validate.error)}</p> : null}
      {plan !== null ? (
        <div className="studio-publication-plan" role="status">
          {publishable ? (
            <p>
              {plan.wouldCreatePublication
                ? `The saved draft is ready to publish in ${props.localeLabel}.`
                : "The published content already matches the saved draft."}
            </p>
          ) : (
            <>
              <p>Publication is blocked. Resolve these issues, save, and check again.</p>
              <ul aria-label="Publication issues">
                {plan.validation.issues.map((issue) => (
                  <li key={`${issue.fieldId}-${issue.code}`}>
                    {labels.get(issue.fieldId) ?? "Field"}: {issue.message}
                  </li>
                ))}
                {plan.entryIssues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
                {plan.validation.status === "restricted_issues" ? (
                  <li>
                    A field that you cannot view blocks publication. Ask a content manager to
                    resolve it.
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </div>
      ) : null}
      {publishable && plan !== null ? (
        <Button
          type="button"
          disabled={command.isPending || publishBlocked !== null}
          onClick={() => {
            const body = studioPublishBody(plan, crypto.randomUUID());
            if (body !== null) command.mutate({ kind: "publish", body });
          }}
        >
          {command.isPending && pending?.kind === "publish"
            ? "Publishing…"
            : `Publish ${props.localeLabel}`}
        </Button>
      ) : null}
      {notice !== null ? (
        <p role="status" className="studio-publication-result">
          {notice}
        </p>
      ) : null}
      {command.isError ? (
        <div role="alert">
          <p>{contentErrorMessage(command.error)}</p>
          <div className="studio-inline-actions">
            {failureCode === "PUBLICATION_STATE_CONFLICT" ||
            failureCode === "PUBLICATION_INVALID" ? (
              <Button
                type="button"
                variant="outline"
                disabled={publishBlocked !== null}
                onClick={() => {
                  void refreshStatus();
                  validate.mutate();
                }}
              >
                Check publication again
              </Button>
            ) : null}
            {failureCode === "DRAFT_VERSION_CONFLICT" || failureCode === "STALE_SCHEMA" ? (
              <Button type="button" variant="outline" onClick={() => void props.onReloadLatest()}>
                Reload latest draft
              </Button>
            ) : null}
            {pending !== null && ambiguous(command.error) ? (
              <Button type="button" variant="outline" onClick={() => command.mutate(pending)}>
                Retry the exact request
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <AlertDialog open={confirmUnpublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish {props.localeLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Delivery stops serving this entry in {props.localeLabel}. Other locales stay
              published, and the draft is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmUnpublish(false)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                const body = studioUnpublishBody(props.status, crypto.randomUUID());
                if (body !== null) command.mutate({ kind: "unpublish", body });
              }}
            >
              {command.isPending ? "Unpublishing…" : "Unpublish"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
