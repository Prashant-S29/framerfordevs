// Renders projected content authority through an exhaustive, instance-isolated control registry.

import { Button } from "@framerfordevs/ui/components/button";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@framerfordevs/ui/components/tabs";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import type {
  ContentFormDefinition,
  ContentFormField,
  ContentFieldKind,
  ContentLayoutGroup,
} from "./model";
import { applyGeneratedFormDefaults } from "./values";

const PortableTextField = lazy(() => import("./portable-text-field"));
const assetKinds = ["image", "video", "audio", "document", "archive", "other"] as const;
const assetDimensions = ["width", "height"] as const;

export interface ContentFieldValidationIssue {
  readonly message: string;
}

export interface ContentFieldValidationResult {
  readonly issues: ReadonlyArray<ContentFieldValidationIssue>;
}

export type ContentFieldValidator = (
  field: ContentFormField,
  value: unknown,
) => ContentFieldValidationResult;

interface ControlProps {
  readonly field: ContentFormField;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly issue: string | undefined;
  readonly instanceId: string;
  readonly path: string;
  readonly helpTextOverride?: string | null;
  readonly onChange: (value: unknown) => void;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function fieldLabel(field: ContentFormField): string {
  return field.displayLabel ?? "List item";
}

function controlIds(props: Pick<ControlProps, "instanceId" | "path">) {
  const control = `${props.instanceId}-${props.path}`;
  return {
    control,
    description: `${control}-description`,
    error: `${control}-error`,
  };
}

function describedBy(props: ControlProps, additionalId?: string): string | undefined {
  const ids = controlIds(props);
  const help = props.helpTextOverride ?? props.field.editor.helpText;
  return (
    [help ? ids.description : null, props.issue ? ids.error : null, additionalId ?? null]
      .filter((value) => value !== null)
      .join(" ") || undefined
  );
}

function FieldShell({
  field,
  issue,
  instanceId,
  path,
  helpTextOverride,
  children,
}: Pick<ControlProps, "field" | "issue" | "instanceId" | "path" | "helpTextOverride"> & {
  readonly children: React.ReactNode;
}) {
  const ids = controlIds({ instanceId, path });
  const help = helpTextOverride ?? field.editor.helpText;
  return (
    <Field data-content-field-id={field.id} data-invalid={Boolean(issue)}>
      <FieldLabel htmlFor={ids.control}>
        {fieldLabel(field)} {field.required === true ? <span>(required)</span> : null}
      </FieldLabel>
      {children}
      {help ? <FieldDescription id={ids.description}>{help}</FieldDescription> : null}
      <FieldError id={ids.error}>{issue}</FieldError>
    </Field>
  );
}

function TextControl(props: ControlProps) {
  const ids = controlIds(props);
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function NetworkTextControl(props: ControlProps) {
  const ids = controlIds(props);
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        type={props.field.kind === "email" ? "email" : "url"}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function LongTextControl(props: ControlProps) {
  const ids = controlIds(props);
  return (
    <FieldShell {...props}>
      <Textarea
        id={ids.control}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function NumberControl(props: ControlProps) {
  const ids = controlIds(props);
  const integer = props.field.kind === "number" && props.field.configuration.mode === "integer";
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : "any"}
        value={
          typeof props.value === "number" || typeof props.value === "string" ? props.value : ""
        }
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => {
          const numeric = Number(event.target.value);
          props.onChange(
            event.target.value === ""
              ? undefined
              : Number.isFinite(numeric)
                ? numeric
                : event.target.value,
          );
        }}
      />
    </FieldShell>
  );
}

function DecimalControl(props: ControlProps) {
  const ids = controlIds(props);
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        type="text"
        inputMode="decimal"
        value={typeof props.value === "string" ? props.value : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function MoneyControl(props: ControlProps) {
  if (props.field.kind !== "money") return null;
  const ids = controlIds(props);
  const money = recordValue(props.value);
  const currency =
    typeof money.currency === "string" ? money.currency : props.field.configuration.currencies[0];
  const amount = typeof money.amount === "string" ? money.amount : "";
  return (
    <FieldShell {...props}>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <Input
          id={ids.control}
          type="text"
          inputMode="decimal"
          value={amount}
          disabled={props.disabled}
          aria-invalid={Boolean(props.issue)}
          aria-describedby={describedBy(props)}
          onChange={(event) => props.onChange({ amount: event.target.value, currency })}
        />
        <NativeSelect
          aria-label={`${fieldLabel(props.field)} currency`}
          value={currency}
          disabled={props.disabled}
          onChange={(event) => props.onChange({ amount, currency: event.target.value })}
        >
          {props.field.configuration.currencies.map((code) => (
            <NativeSelectOption key={code} value={code}>
              {code}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </FieldShell>
  );
}

function BooleanControl(props: ControlProps) {
  const ids = controlIds(props);
  const help = props.helpTextOverride ?? props.field.editor.helpText;
  return (
    <Field
      data-content-field-id={props.field.id}
      orientation="horizontal"
      data-invalid={Boolean(props.issue)}
    >
      <Checkbox
        id={ids.control}
        checked={props.value === true}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onCheckedChange={(checked) => props.onChange(checked === true)}
      />
      <div>
        <FieldLabel htmlFor={ids.control}>{fieldLabel(props.field)}</FieldLabel>
        {help ? <FieldDescription id={ids.description}>{help}</FieldDescription> : null}
        <FieldError id={ids.error}>{props.issue}</FieldError>
      </div>
    </Field>
  );
}

function DateControl(props: ControlProps) {
  const ids = controlIds(props);
  const dateTime = props.field.kind === "date_time";
  const localDescriptionId = dateTime ? `${ids.control}-local-description` : undefined;
  const canonical = typeof props.value === "string" ? props.value : "";
  const instant = dateTime && canonical ? new Date(canonical) : null;
  const displayed =
    instant && Number.isFinite(instant.getTime())
      ? new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : canonical;
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        type={dateTime ? "datetime-local" : "date"}
        value={displayed}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props, localDescriptionId)}
        onChange={(event) => {
          if (!dateTime || event.target.value === "") {
            props.onChange(event.target.value || undefined);
            return;
          }
          const value = new Date(event.target.value);
          props.onChange(
            Number.isFinite(value.getTime()) ? value.toISOString() : event.target.value,
          );
        }}
      />
      {dateTime ? (
        <FieldDescription id={localDescriptionId}>
          Browser-local input; canonical values include an offset.
        </FieldDescription>
      ) : null}
    </FieldShell>
  );
}

function EnumControl(props: ControlProps) {
  if (props.field.kind !== "enum") return null;
  const ids = controlIds(props);
  return (
    <FieldShell {...props}>
      <NativeSelect
        id={ids.control}
        value={typeof props.value === "string" ? props.value : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => props.onChange(event.target.value || undefined)}
      >
        <NativeSelectOption value="">Select an option</NativeSelectOption>
        {[...props.field.configuration.options]
          .sort((left, right) => left.position - right.position)
          .map((option) => (
            <NativeSelectOption key={option.id} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
      </NativeSelect>
    </FieldShell>
  );
}

function JsonControl(props: ControlProps) {
  const ids = controlIds(props);
  const displayed =
    typeof props.value === "string" ? props.value : JSON.stringify(props.value ?? {}, null, 2);
  return (
    <FieldShell {...props}>
      <Textarea
        id={ids.control}
        className="min-h-28 font-mono"
        value={displayed}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => {
          try {
            props.onChange(JSON.parse(event.target.value));
          } catch {
            props.onChange(event.target.value);
          }
        }}
      />
    </FieldShell>
  );
}

function ObjectControl(props: ControlProps) {
  if (props.field.kind !== "object") return null;
  const ids = controlIds(props);
  const value = recordValue(props.value);
  return (
    <FieldSet
      data-content-field-id={props.field.id}
      className="rounded-md border p-4"
      aria-describedby={describedBy(props)}
    >
      <FieldLegend>{fieldLabel(props.field)}</FieldLegend>
      <FieldGroup>
        {props.field.children.map((child) => (
          <GeneratedControl
            key={child.id}
            field={child}
            value={Reflect.get(value, child.id)}
            disabled={props.disabled}
            issue={undefined}
            instanceId={props.instanceId}
            path={`${props.path}-${child.id}`}
            onChange={(next) => props.onChange({ ...value, [child.id]: next })}
          />
        ))}
      </FieldGroup>
      {(props.helpTextOverride ?? props.field.editor.helpText) ? (
        <FieldDescription id={ids.description}>
          {props.helpTextOverride ?? props.field.editor.helpText}
        </FieldDescription>
      ) : null}
      <FieldError id={ids.error}>{props.issue}</FieldError>
    </FieldSet>
  );
}

function ListControl(props: ControlProps) {
  if (props.field.kind !== "list") return null;
  const ids = controlIds(props);
  const values = Array.isArray(props.value) ? props.value : [];
  const item = props.field.children[0];
  const maximum = Math.min(props.field.configuration.maxItems ?? 100, 100);
  return (
    <FieldSet
      data-content-field-id={props.field.id}
      className="rounded-md border p-4"
      aria-describedby={describedBy(props)}
    >
      <FieldLegend>{fieldLabel(props.field)}</FieldLegend>
      <FieldGroup>
        {item
          ? values.map((value, index) => (
              <div key={`${item.id}-${index}`} className="rounded-md border p-3">
                <GeneratedControl
                  field={item}
                  value={value}
                  disabled={props.disabled}
                  issue={undefined}
                  instanceId={props.instanceId}
                  path={`${props.path}-${index}-${item.id}`}
                  onChange={(next) =>
                    props.onChange(
                      values.map((current, currentIndex) =>
                        currentIndex === index ? next : current,
                      ),
                    )
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={props.disabled || index === 0}
                    onClick={() => {
                      const next = [...values];
                      const previous = next[index - 1];
                      if (previous !== undefined) {
                        next[index - 1] = value;
                        next[index] = previous;
                        props.onChange(next);
                      }
                    }}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={props.disabled}
                    onClick={() =>
                      props.onChange(values.filter((_, currentIndex) => currentIndex !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          : null}
      </FieldGroup>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={props.disabled || !item || values.length >= maximum}
        onClick={() => props.onChange([...values, undefined])}
      >
        Add item
      </Button>
      {(props.helpTextOverride ?? props.field.editor.helpText) ? (
        <FieldDescription id={ids.description}>
          {props.helpTextOverride ?? props.field.editor.helpText}
        </FieldDescription>
      ) : null}
      <FieldError id={ids.error}>{props.issue}</FieldError>
    </FieldSet>
  );
}

function ReferenceControl(props: ControlProps) {
  const ids = controlIds(props);
  const instructionId = `${ids.control}-reference-instruction`;
  return (
    <FieldShell {...props}>
      <Input
        id={ids.control}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder="Entry ID"
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props, instructionId)}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => props.onChange(event.target.value || undefined)}
      />
      <FieldDescription id={instructionId}>
        Use a stable entry ID from the configured collection.
      </FieldDescription>
    </FieldShell>
  );
}

function AssetControl(props: ControlProps) {
  const ids = controlIds(props);
  const asset = recordValue(props.value);
  const set = (key: string, value: unknown) =>
    props.onChange({
      source: "external",
      url: "",
      kind: "other",
      title: null,
      alt: null,
      width: null,
      height: null,
      ...asset,
      [key]: value,
    });
  return (
    <FieldSet
      data-content-field-id={props.field.id}
      className="rounded-md border p-4"
      aria-describedby={describedBy(props)}
    >
      <FieldLegend>{fieldLabel(props.field)}</FieldLegend>
      <FieldLabel htmlFor={ids.control}>HTTPS URL</FieldLabel>
      <Input
        id={ids.control}
        type="url"
        value={typeof asset.url === "string" ? asset.url : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => set("url", event.target.value)}
      />
      <FieldLabel htmlFor={`${ids.control}-kind`}>Asset kind</FieldLabel>
      <NativeSelect
        id={`${ids.control}-kind`}
        value={typeof asset.kind === "string" ? asset.kind : "other"}
        disabled={props.disabled}
        onChange={(event) => set("kind", event.target.value)}
      >
        {assetKinds.map((kind) => (
          <NativeSelectOption key={kind} value={kind}>
            {kind}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldLabel htmlFor={`${ids.control}-title`}>Title</FieldLabel>
      <Input
        id={`${ids.control}-title`}
        value={typeof asset.title === "string" ? asset.title : ""}
        disabled={props.disabled}
        onChange={(event) => set("title", event.target.value || null)}
      />
      <FieldLabel htmlFor={`${ids.control}-alt`}>Alternative text</FieldLabel>
      <Input
        id={`${ids.control}-alt`}
        value={typeof asset.alt === "string" ? asset.alt : ""}
        disabled={props.disabled}
        onChange={(event) => set("alt", event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        {assetDimensions.map((dimension) => (
          <div key={dimension}>
            <FieldLabel htmlFor={`${ids.control}-${dimension}`}>{dimension}</FieldLabel>
            <Input
              id={`${ids.control}-${dimension}`}
              type="number"
              min={1}
              max={100_000}
              value={typeof asset[dimension] === "number" ? asset[dimension] : ""}
              disabled={props.disabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                set(dimension, event.target.value && Number.isSafeInteger(value) ? value : null);
              }}
            />
          </div>
        ))}
      </div>
      {(props.helpTextOverride ?? props.field.editor.helpText) ? (
        <FieldDescription id={ids.description}>
          {props.helpTextOverride ?? props.field.editor.helpText}
        </FieldDescription>
      ) : null}
      <FieldError id={ids.error}>{props.issue}</FieldError>
    </FieldSet>
  );
}

function RichTextControl(props: ControlProps) {
  if (props.field.kind !== "rich_text") return null;
  return (
    <FieldShell {...props}>
      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading rich-text editor…</p>}
      >
        <PortableTextField
          label={fieldLabel(props.field)}
          value={props.value}
          disabled={props.disabled}
          configuration={props.field.configuration}
          ariaDescribedBy={describedBy(props)}
          onChange={props.onChange}
        />
      </Suspense>
    </FieldShell>
  );
}

const controlRegistry = {
  short_text: TextControl,
  long_text: LongTextControl,
  rich_text: RichTextControl,
  number: NumberControl,
  decimal: DecimalControl,
  money: MoneyControl,
  boolean: BooleanControl,
  date: DateControl,
  date_time: DateControl,
  enum: EnumControl,
  url: NetworkTextControl,
  email: NetworkTextControl,
  slug: TextControl,
  json: JsonControl,
  object: ObjectControl,
  list: ListControl,
  reference: ReferenceControl,
  external_asset: AssetControl,
} satisfies Record<ContentFieldKind, ComponentType<ControlProps>>;

function GeneratedControl(props: ControlProps) {
  const Control = controlRegistry[props.field.kind];
  return <Control {...props} />;
}

function FormGroup({
  group,
  fields,
  editable,
  definition,
  values,
  issues,
  instanceId,
  setValues,
  clearIssue,
}: {
  readonly group: ContentLayoutGroup;
  readonly fields: ReadonlyMap<string, ContentFormField>;
  readonly editable: ReadonlySet<string>;
  readonly definition: ContentFormDefinition;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: Readonly<Record<string, string>>;
  readonly instanceId: string;
  readonly setValues: (fieldId: string, value: unknown) => void;
  readonly clearIssue: (fieldId: string) => void;
}) {
  return (
    <FieldSet className={group.columns === 2 ? "grid gap-4 md:grid-cols-2" : undefined}>
      <FieldLegend>{group.title}</FieldLegend>
      {group.description ? <FieldDescription>{group.description}</FieldDescription> : null}
      {[...group.fields]
        .sort((left, right) => left.position - right.position)
        .map((placement) => {
          const field = fields.get(placement.fieldId);
          if (!field) return null;
          return (
            <GeneratedControl
              key={field.id}
              field={field}
              value={Reflect.get(values, field.id)}
              disabled={!definition.canEdit || !editable.has(field.id)}
              issue={Reflect.get(issues, field.id)}
              instanceId={instanceId}
              path={field.id}
              helpTextOverride={placement.helpTextOverride}
              onChange={(value) => {
                clearIssue(field.id);
                setValues(field.id, value);
              }}
            />
          );
        })}
    </FieldSet>
  );
}

export interface ContentFormProps {
  readonly definition: ContentFormDefinition;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly onValuesChange?: (values: Readonly<Record<string, unknown>>) => void;
  readonly validateField?: ContentFieldValidator;
  readonly onSubmit?: () => void;
  readonly submitLabel?: string;
  readonly statusMessage?: string;
  readonly serverIssues?: Readonly<Record<string, string>>;
  readonly submitting?: boolean;
}

export function ContentForm({
  definition,
  values: controlledValues,
  onValuesChange,
  validateField,
  onSubmit,
  submitLabel = "Validate preview",
  statusMessage = "Preview values are local and are never saved.",
  serverIssues,
  submitting = false,
}: ContentFormProps) {
  const instanceId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const tabs = useMemo(
    () => [...definition.editorLayout.tabs].sort((left, right) => left.position - right.position),
    [definition.editorLayout.tabs],
  );
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? "");
  const [pendingFocusFieldId, setPendingFocusFieldId] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Readonly<Record<string, unknown>>>(() =>
    applyGeneratedFormDefaults(definition.fields, {}),
  );
  const [localIssues, setLocalIssues] = useState<Readonly<Record<string, string>>>({});
  const [editedFieldIds, setEditedFieldIds] = useState<ReadonlySet<string>>(() => new Set());
  const values = controlledValues ?? localValues;
  const issues = {
    ...Object.fromEntries(
      Object.entries(serverIssues ?? {}).filter(([fieldId]) => !editedFieldIds.has(fieldId)),
    ),
    ...localIssues,
  };
  const fields = useMemo(
    () => new Map(definition.fields.map((field) => [field.id, field])),
    [definition.fields],
  );
  const editable = useMemo(
    () => new Set(definition.editableFieldIds),
    [definition.editableFieldIds],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTabId)) setActiveTabId(tabs[0]?.id ?? "");
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (pendingFocusFieldId === null) return;
    const field = formRef.current?.querySelector<HTMLElement>(
      `[data-content-field-id="${pendingFocusFieldId}"]`,
    );
    field
      ?.querySelector<HTMLElement>("input, textarea, select, button, [contenteditable='true']")
      ?.focus();
    setPendingFocusFieldId(null);
  }, [activeTabId, pendingFocusFieldId]);

  const updateField = (fieldId: string, value: unknown) => {
    const next = { ...values, [fieldId]: value };
    if (onValuesChange) onValuesChange(next);
    else setLocalValues(next);
  };
  const clearIssue = (fieldId: string) => {
    setEditedFieldIds((current) => new Set(current).add(fieldId));
    setLocalIssues((current) =>
      Object.fromEntries(Object.entries(current).filter(([currentId]) => currentId !== fieldId)),
    );
  };
  const groupProps = {
    fields,
    editable,
    definition,
    values,
    issues,
    instanceId,
    setValues: updateField,
    clearIssue,
  };
  const hasSidebar = definition.editorLayout.sidebarGroups.length > 0;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const nextIssues: Record<string, string> = {};
        if (validateField) {
          for (const field of definition.fields) {
            const first = validateField(field, Reflect.get(values, field.id)).issues[0];
            if (first) nextIssues[field.id] = first.message;
          }
        }
        setLocalIssues(nextIssues);
        const firstId = Object.keys(nextIssues)[0];
        if (firstId) {
          const tab = tabs.find((candidate) =>
            candidate.groups.some((group) =>
              group.fields.some((placement) => placement.fieldId === firstId),
            ),
          );
          if (tab) setActiveTabId(tab.id);
          setPendingFocusFieldId(firstId);
        }
        onSubmit?.();
      }}
    >
      {Object.keys(issues).length > 0 ? (
        <div role="alert" tabIndex={-1} className="rounded-md border border-destructive p-3">
          <p className="font-medium">Review the highlighted preview fields.</p>
        </div>
      ) : null}
      <div className={hasSidebar ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" : undefined}>
        <Tabs value={activeTabId} onValueChange={setActiveTabId}>
          <TabsList aria-label="Form sections" className="max-w-full justify-start overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="pt-4">
              <section className="flex flex-col gap-4" aria-labelledby={`${instanceId}-${tab.id}`}>
                <div>
                  <h3 id={`${instanceId}-${tab.id}`} className="font-semibold">
                    {tab.title}
                  </h3>
                  {tab.description ? (
                    <p className="text-muted-foreground text-sm">{tab.description}</p>
                  ) : null}
                </div>
                {[...tab.groups]
                  .sort((left, right) => left.position - right.position)
                  .map((group) => (
                    <FormGroup key={group.id} group={group} {...groupProps} />
                  ))}
              </section>
            </TabsContent>
          ))}
        </Tabs>
        {hasSidebar ? (
          <aside aria-label="Form sidebar" className="flex flex-col gap-4">
            {[...definition.editorLayout.sidebarGroups]
              .sort((left, right) => left.position - right.position)
              .map((group) => (
                <FormGroup key={group.id} group={group} {...groupProps} />
              ))}
          </aside>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {statusMessage}
        </p>
      </div>
    </form>
  );
}
