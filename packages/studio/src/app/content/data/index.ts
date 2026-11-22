import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  StudioContentClientError,
  createStudioContentClient,
  type StudioContentClient,
} from "../../../content-client";
import { useStudioRuntime } from "../../shell";

export const contentQueryKeys = {
  root: ["studio", "content"] as const,
  context: ["studio", "content", "context"] as const,
  entries: (
    collectionId: string,
    locale: string,
    mode: "browse" | "search",
    generation: number,
    page: number,
    cursor: string | null,
  ) =>
    ["studio", "content", "entries", collectionId, locale, mode, generation, page, cursor] as const,
  newWorkspace: (collectionId: string, locale: string) =>
    ["studio", "content", "workspace", "new", collectionId, locale] as const,
  entryWorkspace: (collectionId: string, locale: string, entryId: string) =>
    ["studio", "content", "workspace", "entry", collectionId, locale, entryId] as const,
  revisions: (
    collectionId: string,
    locale: string,
    entryId: string,
    scope: "shared" | "localized",
  ) => ["studio", "content", "revisions", collectionId, locale, entryId, scope] as const,
  entryRevisions: (collectionId: string, locale: string, entryId: string) =>
    ["studio", "content", "revisions", collectionId, locale, entryId] as const,
  publication: (collectionId: string, locale: string, entryId: string) =>
    ["studio", "content", "publication", collectionId, locale, entryId] as const,
  references: (
    collectionId: string,
    locale: string,
    ownerKey: string,
    operation: "resolve" | "search",
    generation: number,
  ) =>
    [
      "studio",
      "content",
      "references",
      collectionId,
      locale,
      ownerKey,
      operation,
      generation,
    ] as const,
};

export function useStudioContentClient(): StudioContentClient {
  const { mountPath } = useStudioRuntime();
  return useMemo(() => createStudioContentClient({ mountPath }), [mountPath]);
}

export function contentRetryDelay(attempt: number): number {
  const boundedAttempt = Math.max(0, Math.min(attempt, 3));
  const boundedJitter = (boundedAttempt * 53 + 17) % 101;
  return Math.min(2_000, 250 * 2 ** boundedAttempt + boundedJitter);
}

export function retryContentQuery(failureCount: number, error: Error): boolean {
  if (failureCount >= 2 || !(error instanceof StudioContentClientError)) return false;
  return error.status === 503 || (error.status === 0 && error.retryable);
}

export function useStudioContentContext() {
  const client = useStudioContentClient();
  return useQuery({
    queryKey: contentQueryKeys.context,
    queryFn: ({ signal }) => client.context(signal),
    retry: retryContentQuery,
    retryDelay: contentRetryDelay,
    staleTime: 30_000,
  });
}

export function normalizeStudioSearch(input: string): string {
  return [...input.normalize("NFC")]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .trim()
    .slice(0, 100);
}

export function useContentRetryCountdown(error: Error | null): number {
  const initial =
    error instanceof StudioContentClientError && error.status === 429
      ? Math.max(1, error.retryAfterSeconds ?? 1)
      : 0;
  const [remaining, setRemaining] = useState(initial);
  const [countdownStart, setCountdownStart] = useState(initial);
  if (countdownStart !== initial) {
    setCountdownStart(initial);
    setRemaining(initial);
  }
  useEffect(() => {
    if (initial === 0) return;
    const interval = window.setInterval(
      () => setRemaining((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [initial]);
  return remaining;
}

export function contentErrorMessage(error: Error | null): string {
  if (error instanceof StudioContentClientError) {
    switch (error.code) {
      case "UNAUTHORIZED":
      case "STUDIO_AUTH_REQUIRED":
      case "STUDIO_SESSION_INVALID":
        return "Your Studio session has ended. Refresh to sign in again.";
      case "FORBIDDEN":
      case "STUDIO_FORBIDDEN":
      case "NOT_FOUND":
      case "LOCALE_UNAVAILABLE":
      case "STUDIO_PROJECT_UNAVAILABLE":
        return "This content is unavailable or you no longer have access.";
      case "RATE_LIMITED":
      case "STUDIO_RATE_LIMITED":
        return "Content is temporarily busy. Wait a moment and try again.";
      case "STALE_SCHEMA":
        return "The content model changed. Reload the latest form before continuing.";
      case "DRAFT_VERSION_CONFLICT":
      case "NAME_VERSION_CONFLICT":
        return "This draft changed elsewhere. Reload it before continuing.";
      case "REVISION_INCOMPATIBLE":
        return "This revision uses a different content model and cannot be restored.";
      case "PUBLICATION_INVALID":
        return "The saved draft no longer passes publication checks. Check publication again to see the issues.";
      case "PUBLICATION_STATE_CONFLICT":
        return "The publication state or the saved draft changed since you checked it. Check publication again.";
      case "COMMAND_CONFLICT":
        return "Studio could not confirm this request. Check the latest state and try again.";
      case "VALIDATION_ERROR":
      case "INVALID_CURSOR":
      case "STUDIO_REQUEST_INVALID":
      case "REQUEST_TOO_LARGE":
        return "Studio could not send this content request.";
      default:
        return "Studio could not load content. Try again.";
    }
  }
  return "Studio could not load content. Try again.";
}
