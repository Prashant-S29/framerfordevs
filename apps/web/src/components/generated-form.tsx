// Renders role-projected generated-form definitions through an exhaustive bounded control registry.

import type {
  CollectionFieldDefinition,
  CollectionFieldKind,
  GeneratedFormDefinition,
} from "@framerfordevs/api/contracts/schemas";
import { validateFieldValue } from "@framerfordevs/api/lib/field-validation";
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
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { lazy, Suspense, useState, type ComponentType } from "react";

import { applyGeneratedFormDefaults } from "@/lib/entry-defaults";

const PortableTextField = lazy(() => import("./portable-text-field"));
const assetKinds: ReadonlyArray<"image" | "video" | "audio" | "document" | "archive" | "other"> = [
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
];
const assetDimensions: ReadonlyArray<"width" | "height"> = ["width", "height"];

interface ControlProps {
  readonly field: CollectionFieldDefinition;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly issue: string | undefined;
  readonly onChange: (value: unknown) => void;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function fieldLabel(field: CollectionFieldDefinition): string {
  return field.displayLabel ?? "List item";
}

function FieldShell({
  field,
  issue,
  children,
}: Pick<ControlProps, "field" | "issue"> & { readonly children: React.ReactNode }) {
  const id = `preview-${field.id}`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <Field id={`field-${field.id}`} data-invalid={Boolean(issue)}>
      <FieldLabel htmlFor={id}>
        {fieldLabel(field)} {field.required === true ? <span>(required)</span> : null}
      </FieldLabel>
      {children}
      {field.editor.helpText ? (
        <FieldDescription id={descriptionId}>{field.editor.helpText}</FieldDescription>
      ) : null}
      <FieldError id={errorId}>{issue}</FieldError>
    </Field>
  );
}

function TextControl(props: ControlProps) {
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function NetworkTextControl(props: ControlProps) {
  const type = props.field.kind === "email" ? "email" : "url";
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        type={type}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function LongTextControl(props: ControlProps) {
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Textarea
        id={`preview-${props.field.id}`}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder={props.field.editor.placeholder ?? undefined}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function NumberControl(props: ControlProps) {
  const integer = props.field.kind === "number" && props.field.configuration.mode === "integer";
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : "any"}
        value={
          typeof props.value === "number" || typeof props.value === "string" ? props.value : ""
        }
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
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
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        type="text"
        inputMode="decimal"
        value={typeof props.value === "string" ? props.value : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function MoneyControl(props: ControlProps) {
  if (props.field.kind !== "money") return null;
  const money = recordValue(props.value);
  const currency =
    typeof money.currency === "string" ? money.currency : props.field.configuration.currencies[0];
  const amount = typeof money.amount === "string" ? money.amount : "";
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <Input
          id={`preview-${props.field.id}`}
          type="text"
          inputMode="decimal"
          value={amount}
          disabled={props.disabled}
          aria-invalid={Boolean(props.issue)}
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
  return (
    <Field orientation="horizontal" data-invalid={Boolean(props.issue)}>
      <Checkbox
        id={`preview-${props.field.id}`}
        checked={props.value === true}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onCheckedChange={(checked) => props.onChange(checked === true)}
      />
      <FieldLabel htmlFor={`preview-${props.field.id}`}>{fieldLabel(props.field)}</FieldLabel>
      <FieldError>{props.issue}</FieldError>
    </Field>
  );
}

function DateControl(props: ControlProps) {
  const dateTime = props.field.kind === "date_time";
  const canonical = typeof props.value === "string" ? props.value : "";
  const instant = dateTime && canonical ? new Date(canonical) : null;
  const displayed =
    instant && Number.isFinite(instant.getTime())
      ? new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : canonical;
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        type={dateTime ? "datetime-local" : "date"}
        value={displayed}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
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
        <FieldDescription>
          Browser-local input; canonical values include an explicit offset.
        </FieldDescription>
      ) : null}
    </FieldShell>
  );
}

function EnumControl(props: ControlProps) {
  if (props.field.kind !== "enum") return null;
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <NativeSelect
        id={`preview-${props.field.id}`}
        value={typeof props.value === "string" ? props.value : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
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
  const displayed =
    typeof props.value === "string" ? props.value : JSON.stringify(props.value ?? {}, null, 2);
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Textarea
        id={`preview-${props.field.id}`}
        className="min-h-28 font-mono"
        value={displayed}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
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
  const value = recordValue(props.value);
  return (
    <FieldSet className="rounded-md border p-4">
      <FieldLegend>{fieldLabel(props.field)}</FieldLegend>
      <FieldGroup>
        {props.field.children.map((child) => (
          <GeneratedControl
            key={child.id}
            field={child}
            value={Reflect.get(value, child.id)}
            disabled={props.disabled}
            issue={undefined}
            onChange={(next) => props.onChange({ ...value, [child.id]: next })}
          />
        ))}
      </FieldGroup>
      <FieldError>{props.issue}</FieldError>
    </FieldSet>
  );
}

function ListControl(props: ControlProps) {
  if (props.field.kind !== "list") return null;
  const values = Array.isArray(props.value) ? props.value : [];
  const item = props.field.children[0];
  return (
    <FieldSet className="rounded-md border p-4">
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
        disabled={props.disabled || !item || values.length >= 100}
        onClick={() => props.onChange([...values, undefined])}
      >
        Add item
      </Button>
      <FieldError>{props.issue}</FieldError>
    </FieldSet>
  );
}

function ReferenceControl(props: ControlProps) {
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Input
        id={`preview-${props.field.id}`}
        value={typeof props.value === "string" ? props.value : ""}
        placeholder="Entry ID"
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => props.onChange(event.target.value || undefined)}
      />
      <FieldDescription>Use a stable entry ID from the configured collection.</FieldDescription>
    </FieldShell>
  );
}

function AssetControl(props: ControlProps) {
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
    <FieldSet className="rounded-md border p-4">
      <FieldLegend>{fieldLabel(props.field)}</FieldLegend>
      <FieldLabel htmlFor={`preview-${props.field.id}`}>HTTPS URL</FieldLabel>
      <Input
        id={`preview-${props.field.id}`}
        type="url"
        value={typeof asset.url === "string" ? asset.url : ""}
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        onChange={(event) => set("url", event.target.value)}
      />
      <FieldLabel htmlFor={`preview-${props.field.id}-kind`}>Asset kind</FieldLabel>
      <NativeSelect
        id={`preview-${props.field.id}-kind`}
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
      <FieldLabel htmlFor={`preview-${props.field.id}-title`}>Title</FieldLabel>
      <Input
        id={`preview-${props.field.id}-title`}
        value={typeof asset.title === "string" ? asset.title : ""}
        disabled={props.disabled}
        onChange={(event) => set("title", event.target.value || null)}
      />
      <FieldLabel htmlFor={`preview-${props.field.id}-alt`}>Alternative text</FieldLabel>
      <Input
        id={`preview-${props.field.id}-alt`}
        value={typeof asset.alt === "string" ? asset.alt : ""}
        disabled={props.disabled}
        onChange={(event) => set("alt", event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        {assetDimensions.map((dimension) => (
          <div key={dimension}>
            <FieldLabel htmlFor={`preview-${props.field.id}-${dimension}`}>{dimension}</FieldLabel>
            <Input
              id={`preview-${props.field.id}-${dimension}`}
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
      <FieldError>{props.issue}</FieldError>
    </FieldSet>
  );
}

function RichTextControl(props: ControlProps) {
  if (props.field.kind !== "rich_text") return null;
  return (
    <FieldShell field={props.field} issue={props.issue}>
      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading rich-text editor…</p>}
      >
        <PortableTextField
          label={fieldLabel(props.field)}
          value={props.value}
          disabled={props.disabled}
          configuration={props.field.configuration}
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
} satisfies Record<CollectionFieldKind, ComponentType<ControlProps>>;

function GeneratedControl(props: ControlProps) {
  const Control = controlRegistry[props.field.kind];
  return <Control {...props} />;
}

interface GeneratedFormProps {
  readonly definition: GeneratedFormDefinition;
  readonly values?: Readonly<Record<string, unknown>>;
  readonly onValuesChange?: (values: Readonly<Record<string, unknown>>) => void;
  readonly onSubmit?: () => void;
  readonly submitLabel?: string;
  readonly statusMessage?: string;
  readonly serverIssues?: Readonly<Record<string, string>>;
  readonly submitting?: boolean;
}

export function GeneratedForm({
  definition,
  values: controlledValues,
  onValuesChange,
  onSubmit,
  submitLabel = "Validate preview",
  statusMessage = "Preview values are local and are never saved.",
  serverIssues,
  submitting = false,
}: GeneratedFormProps) {
  const [localValues, setLocalValues] = useState<Readonly<Record<string, unknown>>>(() =>
    applyGeneratedFormDefaults(definition.fields, {}),
  );
  const [localIssues, setLocalIssues] = useState<Readonly<Record<string, string>>>({});
  const values = controlledValues ?? localValues;
  const issues = serverIssues ?? localIssues;
  const setValues = (
    update: (current: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>,
  ) => {
    const next = update(values);
    if (onValuesChange) onValuesChange(next);
    else setLocalValues(next);
  };
  const fields = new Map<string, CollectionFieldDefinition>(
    definition.fields.map((field) => [field.id, field]),
  );
  const editable = new Set<string>(definition.editableFieldIds);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const nextIssues: Record<string, string> = {};
        for (const field of definition.fields) {
          const result = validateFieldValue(field, Reflect.get(values, field.id));
          const first = result.issues[0];
          if (first) nextIssues[field.id] = first.message;
        }
        setLocalIssues(nextIssues);
        const firstId = Object.keys(nextIssues)[0];
        if (firstId) document.querySelector<HTMLElement>(`#field-${firstId}`)?.focus();
        if (onSubmit) onSubmit();
      }}
    >
      {Object.keys(issues).length > 0 ? (
        <div role="alert" tabIndex={-1} className="rounded-md border border-destructive p-3">
          <p className="font-medium">Review the highlighted preview fields.</p>
        </div>
      ) : null}
      {definition.editorLayout.tabs.map((tab) => (
        <section key={tab.id} className="flex flex-col gap-4" aria-labelledby={`tab-${tab.id}`}>
          <div>
            <h3 id={`tab-${tab.id}`} className="font-semibold">
              {tab.title}
            </h3>
            {tab.description ? (
              <p className="text-muted-foreground text-sm">{tab.description}</p>
            ) : null}
          </div>
          {tab.groups.map((group) => (
            <FieldSet
              key={group.id}
              className={group.columns === 2 ? "grid gap-4 md:grid-cols-2" : undefined}
            >
              <FieldLegend>{group.title}</FieldLegend>
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
                      onChange={(value) =>
                        setValues((current) => ({ ...current, [field.id]: value }))
                      }
                    />
                  );
                })}
            </FieldSet>
          ))}
        </section>
      ))}
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
