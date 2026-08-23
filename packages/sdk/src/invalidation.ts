// Normalizes verified webhook invalidation authority without making framework or network claims.

import type { VerifiedPublicationWebhookEvent } from "./webhooks";

export interface NormalizedInvalidation {
  readonly eventId: string;
  readonly eventType: VerifiedPublicationWebhookEvent["type"];
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly systemTags: ReadonlyArray<string>;
  readonly semanticTags: ReadonlyArray<string>;
  readonly routes: ReadonlyArray<string>;
}

function sortedUnique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function normalizeInvalidation(
  event: VerifiedPublicationWebhookEvent,
): NormalizedInvalidation {
  return {
    eventId: event.id,
    eventType: event.type,
    projectId: event.data.projectId,
    environmentId: event.data.environmentId,
    collectionId: event.data.collectionId,
    systemTags: sortedUnique(event.data.invalidation.systemTags),
    semanticTags: sortedUnique(event.data.invalidation.semanticTags),
    routes: sortedUnique(event.data.invalidation.routes),
  };
}
