export const projectAuditCategoryValues = [
  "security",
  "project",
  "governance",
  "schema",
  "content",
  "publication",
  "webhook",
  "tooling",
  "other",
] as const;

export type ProjectAuditCategory = (typeof projectAuditCategoryValues)[number];

const publicationActions = new Set([
  "cms.schema.published",
  "cms.entry.locale.published",
  "cms.entry.locale.unpublished",
]);

/** Classifies existing and future bounded audit actions without hiding unknown history. */
export function projectAuditCategory(action: string): ProjectAuditCategory {
  if (action === "project.audit.read" || action.startsWith("project.credential.")) {
    return "security";
  }
  if (action.startsWith("cms.webhook.") || action.startsWith("cms.invalidation.")) {
    return "webhook";
  }
  if (publicationActions.has(action)) return "publication";
  if (
    action.startsWith("project.membership.") ||
    action.startsWith("project.invitation.") ||
    action.startsWith("project.locale.") ||
    action.startsWith("workspace.membership.")
  ) {
    return "governance";
  }
  if (
    action.startsWith("cms.schema.") ||
    action.startsWith("cms.collection.") ||
    action.startsWith("cms.editor_layout.")
  ) {
    return "schema";
  }
  if (action.startsWith("cms.entry.")) return "content";
  if (action.startsWith("tooling.")) return "tooling";
  if (
    action.startsWith("project.") ||
    action.startsWith("workspace.") ||
    action.startsWith("environment.") ||
    action.startsWith("studio_registration.")
  ) {
    return "project";
  }
  return "other";
}
