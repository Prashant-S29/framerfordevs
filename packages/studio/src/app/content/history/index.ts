import type {
  StudioFormDto,
  StudioJsonObject,
  StudioFormFieldDto,
  StudioJsonValue,
  StudioRevisionComparisonItemDto,
  StudioRevisionSummaryDto,
} from "../../../contracts/content";

const maximumValueCharacters = 280;

export function studioFieldLabels(form: StudioFormDto): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const visit = (fields: ReadonlyArray<StudioFormFieldDto>, parent: string | null) => {
    for (const field of fields) {
      const own = field.displayLabel ?? (field.nodeRole === "list_item" ? "Item" : "Field");
      const label = parent === null ? own : `${parent} › ${own}`;
      labels.set(field.id, label);
      visit(field.children, label);
    }
  };
  visit(form.fields, null);
  return labels;
}

export function studioRevisionAuthor(
  revision: Pick<StudioRevisionSummaryDto, "authoredByUserId" | "authoredByCredentialId">,
  currentUserId: string,
): string {
  if (revision.authoredByUserId !== null) {
    return revision.authoredByUserId === currentUserId ? "You" : "Another editor";
  }
  return revision.authoredByCredentialId !== null ? "An API credential" : "Unknown author";
}

export function studioChangedFieldSummary(
  revision: Pick<StudioRevisionSummaryDto, "changedFieldIds">,
  labels: ReadonlyMap<string, string>,
): string {
  const names = revision.changedFieldIds.flatMap((id) => {
    const label = labels.get(id);
    return label === undefined ? [] : [label];
  });
  if (names.length === 0) return "No visible field changes";
  if (names.length <= 3) return `Changed ${names.join(", ")}`;
  return `Changed ${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

function isJsonObject(value: StudioJsonValue | undefined): value is StudioJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function portableTextPlainText(value: StudioJsonObject): string | null {
  const blocks = value.blocks;
  if (value.profile !== "ffd-portable-text" || !Array.isArray(blocks)) return null;
  return blocks
    .map((block: StudioJsonValue) => {
      if (!isJsonObject(block)) return "";
      const children = block.children;
      if (!Array.isArray(children)) return "";
      return children
        .map((child: StudioJsonValue) =>
          isJsonObject(child) && typeof child.text === "string" ? child.text : "",
        )
        .join("");
    })
    .join("\n");
}

function bounded(text: string): string {
  return text.length > maximumValueCharacters
    ? `${text.slice(0, maximumValueCharacters - 1)}…`
    : text;
}

export function formatStudioValue(value: StudioJsonValue | undefined): string {
  if (value === undefined || value === null) return "Empty";
  if (typeof value === "string") return value.length === 0 ? "Empty" : bounded(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const text = isJsonObject(value) ? portableTextPlainText(value) : null;
  if (text !== null) return text.length === 0 ? "Empty" : bounded(text);
  return bounded(JSON.stringify(value));
}

export function studioComparisonChangeLabel(
  change: StudioRevisionComparisonItemDto["change"],
): string {
  switch (change) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "changed":
      return "Changed";
  }
}

export function studioRevisionRestoreBlocker(input: {
  readonly revision: Pick<StudioRevisionSummaryDto, "id" | "compatible">;
  readonly headRevisionId: string | null;
  readonly dirty: boolean;
}): string | null {
  if (!input.revision.compatible) {
    return "This revision uses an older content model. Only revisions that match the current model can be restored.";
  }
  if (input.revision.id === input.headRevisionId) return "This revision is the current draft.";
  if (input.dirty) return "Save or discard your unsaved changes before you restore a revision.";
  return null;
}
