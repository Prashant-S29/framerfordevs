import { decodeStudioContentEnvelope, type StudioContentBrowserFailure } from "../content";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface StudioPresentationEnumOptionDto {
  readonly optionId: string;
  readonly label: string;
  readonly position: number;
}

export interface StudioPresentationFieldDto {
  readonly fieldId: string;
  readonly parentFieldId: string | null;
  readonly kind: string;
  readonly displayLabel: string | null;
  readonly position: number;
  readonly helpText: string | null;
  readonly placeholder: string | null;
  readonly enumOptions: ReadonlyArray<StudioPresentationEnumOptionDto>;
}

export interface StudioPresentationPlacementDto {
  readonly fieldId: string;
  readonly position: number;
  readonly helpTextOverride: string | null;
}

export interface StudioPresentationGroupDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly columns: 1 | 2;
  readonly fields: ReadonlyArray<StudioPresentationPlacementDto>;
}

export interface StudioPresentationTabDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly groups: ReadonlyArray<StudioPresentationGroupDto>;
}

export interface StudioPresentationLayoutDto {
  readonly tabs: ReadonlyArray<StudioPresentationTabDto>;
  readonly sidebarGroups: ReadonlyArray<StudioPresentationGroupDto>;
}

export interface StudioPresentationDto {
  readonly collectionId: string;
  readonly revisionId: string;
  readonly sequence: number;
  readonly presentation: {
    readonly displayName: string;
    readonly description: string | null;
    readonly fields: ReadonlyArray<StudioPresentationFieldDto>;
    readonly layout: StudioPresentationLayoutDto;
  };
}

export interface StudioPublishPresentationResultDto {
  readonly replayed: boolean;
  readonly noOp: boolean;
  readonly presentation: StudioPresentationDto;
}

function invalid(): never {
  throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
}

function record(value: unknown, keys: ReadonlyArray<string>): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  if (Object.keys(value).toSorted().join(",") !== [...keys].toSorted().join(",")) return invalid();
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown, minimum: number, maximum: number): string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum
    ? value
    : invalid();
}

function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : text(value, 0, maximum);
}

function id(value: unknown): string {
  return typeof value === "string" && uuid.test(value) ? value : invalid();
}

function position(value: unknown, maximum: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : invalid();
}

function list<T>(value: unknown, minimum: number, maximum: number, item: (value: unknown) => T) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return invalid();
  return value.map(item);
}

function group(value: unknown): StudioPresentationGroupDto {
  const data = record(value, ["id", "title", "description", "position", "columns", "fields"]);
  const columns = data.columns === 1 || data.columns === 2 ? data.columns : invalid();
  return {
    id: id(data.id),
    title: text(data.title, 1, 100),
    description: nullableText(data.description, 500),
    position: position(data.position, 19),
    columns,
    fields: list(data.fields, 0, 100, (placement) => {
      const entry = record(placement, ["fieldId", "position", "helpTextOverride"]);
      return {
        fieldId: id(entry.fieldId),
        position: position(entry.position, 99),
        helpTextOverride: nullableText(entry.helpTextOverride, 500),
      };
    }),
  };
}

function field(value: unknown): StudioPresentationFieldDto {
  const data = record(value, [
    "fieldId",
    "parentFieldId",
    "kind",
    "displayLabel",
    "position",
    "helpText",
    "placeholder",
    "enumOptions",
  ]);
  return {
    fieldId: id(data.fieldId),
    parentFieldId: data.parentFieldId === null ? null : id(data.parentFieldId),
    kind: text(data.kind, 1, 32),
    displayLabel: data.displayLabel === null ? null : text(data.displayLabel, 1, 100),
    position: position(data.position, 99),
    helpText: nullableText(data.helpText, 500),
    placeholder: nullableText(data.placeholder, 200),
    enumOptions: list(data.enumOptions, 0, 100, (option) => {
      const entry = record(option, ["optionId", "label", "position"]);
      return {
        optionId: id(entry.optionId),
        label: text(entry.label, 1, 100),
        position: position(entry.position, 99),
      };
    }),
  };
}

function presentation(value: unknown): StudioPresentationDto {
  const data = record(value, ["collectionId", "revisionId", "sequence", "presentation"]);
  const document = record(data.presentation, ["displayName", "description", "fields", "layout"]);
  const layout = record(document.layout, ["tabs", "sidebarGroups"]);
  return {
    collectionId: id(data.collectionId),
    revisionId: id(data.revisionId),
    sequence:
      Number.isSafeInteger(data.sequence) && Number(data.sequence) >= 1
        ? Number(data.sequence)
        : invalid(),
    presentation: {
      displayName: text(document.displayName, 1, 100),
      description: nullableText(document.description, 500),
      fields: list(document.fields, 1, 100, field),
      layout: {
        tabs: list(layout.tabs, 1, 10, (tab) => {
          const entry = record(tab, ["id", "title", "description", "position", "groups"]);
          return {
            id: id(entry.id),
            title: text(entry.title, 1, 100),
            description: nullableText(entry.description, 500),
            position: position(entry.position, 9),
            groups: list(entry.groups, 1, 20, group),
          };
        }),
        sidebarGroups: list(layout.sidebarGroups, 0, 10, group),
      },
    },
  };
}

export function decodeStudioPresentationResponse(
  value: unknown,
  status: number,
  expectedCollectionId: string,
): StudioPresentationDto | StudioContentBrowserFailure {
  return decodeStudioContentEnvelope(value, status, (data) => {
    const decoded = presentation(data);
    return decoded.collectionId === expectedCollectionId ? decoded : invalid();
  });
}

export function decodeStudioPublishPresentationResponse(
  value: unknown,
  status: number,
  expectedCollectionId: string,
): StudioPublishPresentationResultDto | StudioContentBrowserFailure {
  return decodeStudioContentEnvelope(value, status, (data) => {
    const result = record(data, ["replayed", "noOp", "presentation"]);
    const decoded = presentation(result.presentation);
    if (
      typeof result.replayed !== "boolean" ||
      typeof result.noOp !== "boolean" ||
      decoded.collectionId !== expectedCollectionId
    ) {
      return invalid();
    }
    return { replayed: result.replayed, noOp: result.noOp, presentation: decoded };
  });
}
