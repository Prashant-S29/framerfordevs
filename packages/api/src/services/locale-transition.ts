import type { ProjectLocaleStatus } from "../contracts/locales";

export interface LocaleDependencyState {
  readonly draftCount: number;
  readonly currentPublicationCount: number;
  readonly draftCountCapped: boolean;
  readonly currentPublicationCountCapped: boolean;
}

export type LocaleTransitionDecision =
  | { readonly kind: "no_change" }
  | { readonly kind: "allowed" }
  | { readonly kind: "invalid" }
  | { readonly kind: "dependencies" };

export function decideLocaleTransition(options: {
  readonly currentStatus: ProjectLocaleStatus;
  readonly requestedStatus: ProjectLocaleStatus;
  readonly isEnglish: boolean;
  readonly confirmDraftImpact: boolean;
  readonly dependencies: LocaleDependencyState;
}): LocaleTransitionDecision {
  if (options.currentStatus === options.requestedStatus) return { kind: "no_change" };
  if (options.isEnglish && options.requestedStatus !== "enabled") return { kind: "invalid" };
  if (options.currentStatus === "removed" && options.requestedStatus === "disabled") {
    return { kind: "invalid" };
  }
  if (
    (options.requestedStatus === "disabled" || options.requestedStatus === "removed") &&
    options.dependencies.currentPublicationCount > 0
  ) {
    return { kind: "dependencies" };
  }
  if (
    (options.requestedStatus === "disabled" || options.requestedStatus === "removed") &&
    options.dependencies.draftCount > 0 &&
    !options.confirmDraftImpact
  ) {
    return { kind: "dependencies" };
  }
  return { kind: "allowed" };
}
