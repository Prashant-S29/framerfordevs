import type { RichTextConfiguration } from "@framerfordevs/api/contracts/field-system";
import type { CollectionFieldKind } from "@framerfordevs/api/contracts/schemas";
import { iso4217MinorUnits } from "@framerfordevs/api/registry/iso-4217.generated";
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
import { PlusIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import {
  defaultFieldConfiguration,
  fieldKindOptions,
  type SchemaEditorField,
  type SchemaEditorIssue,
} from "@/lib/schema-authoring";

const PortableTextField = lazy(() => import("./portable-text-field"));

const richTextStyleOptions = [
  ["normal", "Paragraph"],
  ["h2", "Heading 2"],
  ["h3", "Heading 3"],
  ["h4", "Heading 4"],
  ["h5", "Heading 5"],
  ["h6", "Heading 6"],
  ["blockquote", "Blockquote"],
] as const;
const richTextDecoratorOptions = [
  ["strong", "Bold"],
  ["em", "Italic"],
  ["underline", "Underline"],
  ["strike-through", "Strikethrough"],
  ["code", "Code"],
] as const;
const richTextListOptions = [
  ["bullet", "Bulleted"],
  ["number", "Numbered"],
] as const;

const roleOptions = [
  ["owner", "Owner"],
  ["developer", "Developer"],
  ["content_admin", "Content Admin"],
  ["editor", "Editor"],
  ["reviewer", "Reviewer"],
  ["client_editor", "Client Editor"],
  ["read_only", "Read Only"],
] as const;

interface SchemaFieldInspectorProps {
  readonly field: SchemaEditorField;
  readonly parent?: SchemaEditorField;
  readonly collectionId: string;
  readonly collections: ReadonlyArray<{ readonly id: string; readonly displayName: string }>;
  readonly apiKeyConflict: boolean;
  readonly issues: ReadonlyArray<SchemaEditorIssue>;
  readonly onChange: (field: SchemaEditorField) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configRecord(field: SchemaEditorField): Record<string, unknown> {
  return isRecord(field.configuration) ? field.configuration : {};
}

function optionalString(record: Record<string, unknown>, key: string): string {
  const value = Reflect.get(record, key);
  return typeof value === "string" ? value : "";
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = Reflect.get(record, key);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = Reflect.get(record, key);
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(record: Record<string, unknown>, key: string): ReadonlyArray<string> {
  const value = Reflect.get(record, key);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function setRecordValue(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (value === undefined)
    return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
  return { ...record, [key]: value };
}

function OptionalTextSetting({
  id,
  label,
  description,
  value,
  type = "text",
  inputMode,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly type?: "text" | "url" | "email" | "date" | "datetime-local";
  readonly inputMode?: "decimal";
  readonly onChange: (value: string | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function OptionalLongTextSetting({
  id,
  label,
  description,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly onChange: (value: string | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        name={id}
        value={value}
        rows={5}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function OptionalDateTimeSetting({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string | undefined) => void;
}) {
  const instant = value ? new Date(value) : null;
  const displayed =
    instant && Number.isFinite(instant.getTime())
      ? new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : value;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type="datetime-local"
        value={displayed}
        autoComplete="off"
        onChange={(event) => {
          if (!event.target.value) return onChange(undefined);
          const next = new Date(event.target.value);
          onChange(Number.isFinite(next.getTime()) ? next.toISOString() : event.target.value);
        }}
      />
      <FieldDescription>Browser-local input; stored as an RFC 3339 instant.</FieldDescription>
    </Field>
  );
}

function OptionalNumberSetting({
  id,
  label,
  description,
  value,
  integer = false,
  minimum,
  maximum,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly value: number | undefined;
  readonly integer?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly onChange: (value: number | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : "any"}
        min={minimum}
        max={maximum}
        value={value ?? ""}
        autoComplete="off"
        onChange={(event) => {
          if (!event.target.value) return onChange(undefined);
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function OptionalBooleanSetting({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: boolean | undefined;
  readonly onChange: (value: boolean | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={id}
        value={value === undefined ? "unset" : value ? "true" : "false"}
        onChange={(event) =>
          onChange(event.target.value === "unset" ? undefined : event.target.value === "true")
        }
      >
        <NativeSelectOption value="unset">No Default</NativeSelectOption>
        <NativeSelectOption value="true">True</NativeSelectOption>
        <NativeSelectOption value="false">False</NativeSelectOption>
      </NativeSelect>
    </Field>
  );
}

function JsonSetting({
  id,
  label,
  value,
  expectedRoot = "any",
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly expectedRoot?: "any" | "object" | "array";
  readonly onChange: (value: unknown) => void;
}) {
  const [source, setSource] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string>();
  const apply = () => {
    if (!source.trim()) {
      setError(undefined);
      onChange(undefined);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(source);
      if (expectedRoot === "object" && !isRecord(parsed)) {
        setError("Enter a JSON object.");
        return;
      }
      if (expectedRoot === "array" && !Array.isArray(parsed)) {
        setError("Enter a JSON array.");
        return;
      }
      setError(undefined);
      onChange(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter valid JSON.");
    }
  };
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        name={id}
        value={source}
        rows={6}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        onChange={(event) => setSource(event.target.value)}
        onBlur={apply}
      />
      <FieldDescription>
        Leave empty for no default.{" "}
        {expectedRoot === "object" ? "Object" : expectedRoot === "array" ? "Array" : "JSON"} syntax
        is validated when focus leaves the editor.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function CheckboxOptions({
  legend,
  values,
  options,
  onChange,
}: {
  readonly legend: string;
  readonly values: ReadonlyArray<string>;
  readonly options: ReadonlyArray<readonly [string, string]>;
  readonly onChange: (values: ReadonlyArray<string>) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <FieldGroup className="gap-2">
        {options.map(([value, label]) => {
          const id = `${legend}-${value}`.replaceAll(" ", "-").toLowerCase();
          return (
            <Field key={value} orientation="horizontal">
              <Checkbox
                id={id}
                checked={values.includes(value)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...values, value]
                      : values.filter((current) => current !== value),
                  )
                }
              />
              <FieldLabel htmlFor={id}>{label}</FieldLabel>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}

function configuredRichTextValues<Value extends string>(
  record: Record<string, unknown>,
  key: string,
  options: ReadonlyArray<readonly [Value, string]>,
): ReadonlyArray<Value> {
  const configured = Reflect.get(record, key);
  if (configured === undefined) return options.map(([value]) => value);
  if (!Array.isArray(configured)) return [];
  const allowed = new Set<string>(options.map(([value]) => value));
  return configured.filter(
    (value): value is Value => typeof value === "string" && allowed.has(value),
  );
}

function richTextEditorConfiguration(record: Record<string, unknown>): RichTextConfiguration {
  return {
    styles: configuredRichTextValues(record, "styles", richTextStyleOptions),
    decorators: configuredRichTextValues(record, "decorators", richTextDecoratorOptions),
    lists: configuredRichTextValues(record, "lists", richTextListOptions),
    links: optionalBoolean(record, "links") ?? true,
  };
}

function RichTextDefaultSetting({
  field,
  record,
  onChange,
}: {
  readonly field: SchemaEditorField;
  readonly record: Record<string, unknown>;
  readonly onChange: (configuration: unknown) => void;
}) {
  const enabled = record.default !== undefined;
  const setDefault = (value: unknown) => onChange(setRecordValue(record, "default", value));
  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <Checkbox
          id="config-rich-default-enabled"
          checked={enabled}
          onCheckedChange={(checked) =>
            setDefault(
              checked === true
                ? { version: 1, profile: "ffd-portable-text", blocks: [] }
                : undefined,
            )
          }
        />
        <FieldLabel htmlFor="config-rich-default-enabled">Configure a Default Document</FieldLabel>
      </Field>
      {enabled ? (
        <FieldSet>
          <FieldLegend variant="label">Default Rich Text Content</FieldLegend>
          <Suspense
            fallback={<p className="text-muted-foreground text-sm">Loading rich-text editor…</p>}
          >
            <PortableTextField
              key={`${field.localId}-rich-default`}
              label="Default rich text content"
              value={record.default}
              disabled={false}
              configuration={richTextEditorConfiguration(record)}
              onChange={setDefault}
            />
          </Suspense>
          <FieldDescription>
            Leave disabled for no default. Content is stored as the approved Portable Text document.
          </FieldDescription>
        </FieldSet>
      ) : null}
    </FieldGroup>
  );
}

interface EnumOptionValue {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly position: number;
}

function enumOptions(record: Record<string, unknown>): ReadonlyArray<EnumOptionValue> {
  const value = record.options;
  if (!Array.isArray(value)) return [];
  return value.flatMap((option, index) => {
    if (!isRecord(option)) return [];
    const id = option.id;
    const optionValue = option.value;
    const label = option.label;
    if (typeof id !== "string" || typeof optionValue !== "string" || typeof label !== "string")
      return [];
    return [{ id, value: optionValue, label, position: index }];
  });
}

function EnumConfiguration({
  record,
  onChange,
}: {
  readonly record: Record<string, unknown>;
  readonly onChange: (configuration: unknown) => void;
}) {
  const options = enumOptions(record);
  const updateOptions = (next: ReadonlyArray<EnumOptionValue>) =>
    onChange({ ...record, options: next.map((option, position) => ({ ...option, position })) });
  const defaultValue = optionalString(record, "default");
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Options</FieldLegend>
        <FieldDescription>
          Values become stable content API values; labels are editor-facing.
        </FieldDescription>
        <FieldGroup className="gap-3">
          {options.map((option, index) => (
            <FieldSet key={option.id} className="rounded-md border p-3">
              <FieldLegend className="sr-only">Option {index + 1}</FieldLegend>
              <FieldGroup className="gap-2 sm:grid sm:grid-cols-[1fr_1fr_auto]">
                <Field>
                  <FieldLabel htmlFor={`enum-label-${option.id}`}>Label</FieldLabel>
                  <Input
                    id={`enum-label-${option.id}`}
                    name={`enum-label-${option.id}`}
                    value={option.label}
                    maxLength={100}
                    autoComplete="off"
                    onChange={(event) =>
                      updateOptions(
                        options.map((current) =>
                          current.id === option.id
                            ? { ...current, label: event.target.value }
                            : current,
                        ),
                      )
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`enum-value-${option.id}`}>API Value</FieldLabel>
                  <Input
                    id={`enum-value-${option.id}`}
                    name={`enum-value-${option.id}`}
                    value={option.value}
                    maxLength={63}
                    spellCheck={false}
                    autoComplete="off"
                    translate="no"
                    onChange={(event) =>
                      updateOptions(
                        options.map((current) =>
                          current.id === option.id
                            ? { ...current, value: event.target.value.toLowerCase() }
                            : current,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove option ${option.label || index + 1}`}
                  disabled={options.length === 1}
                  onClick={() =>
                    updateOptions(options.filter((current) => current.id !== option.id))
                  }
                >
                  <Trash2Icon />
                </Button>
              </FieldGroup>
            </FieldSet>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={options.length >= 100}
            onClick={() => {
              const index = options.length + 1;
              updateOptions([
                ...options,
                {
                  id: crypto.randomUUID(),
                  value: `option_${index}`,
                  label: `Option ${index}`,
                  position: options.length,
                },
              ]);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add Option
          </Button>
        </FieldGroup>
      </FieldSet>
      <Field>
        <FieldLabel htmlFor="enum-default">Default Option</FieldLabel>
        <NativeSelect
          id="enum-default"
          name="enum-default"
          value={defaultValue}
          onChange={(event) =>
            onChange(setRecordValue(record, "default", event.target.value || undefined))
          }
        >
          <NativeSelectOption value="">No Default</NativeSelectOption>
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.value}>
              {option.label || option.value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </FieldGroup>
  );
}

function CommonStringConfiguration({
  record,
  defaultMaximum,
  multilineDefault = false,
  onChange,
}: {
  readonly record: Record<string, unknown>;
  readonly defaultMaximum: number;
  readonly multilineDefault?: boolean;
  readonly onChange: (configuration: unknown) => void;
}) {
  const set = (key: string, value: unknown) => onChange(setRecordValue(record, key, value));
  return (
    <FieldGroup>
      <OptionalNumberSetting
        id="config-min-length"
        label="Minimum Length"
        integer
        value={optionalNumber(record, "minLength")}
        onChange={(value) => set("minLength", value)}
      />
      <OptionalNumberSetting
        id="config-max-length"
        label="Maximum Length"
        integer
        value={optionalNumber(record, "maxLength")}
        onChange={(value) => set("maxLength", value)}
      />
      <OptionalTextSetting
        id="config-pattern"
        label="Safe Pattern"
        description="RE2-compatible expression, up to 256 characters."
        value={optionalString(record, "pattern")}
        onChange={(value) => set("pattern", value)}
      />
      {multilineDefault ? (
        <OptionalLongTextSetting
          id="config-default"
          label="Default Value"
          description={`Optional default, up to ${defaultMaximum.toLocaleString()} characters.`}
          value={optionalString(record, "default")}
          onChange={(value) => set("default", value)}
        />
      ) : (
        <OptionalTextSetting
          id="config-default"
          label="Default Value"
          description={`Optional default, up to ${defaultMaximum.toLocaleString()} characters.`}
          value={optionalString(record, "default")}
          onChange={(value) => set("default", value)}
        />
      )}
    </FieldGroup>
  );
}

function TypeConfiguration({
  field,
  collectionId,
  collections,
  onChange,
}: {
  readonly field: SchemaEditorField;
  readonly collectionId: string;
  readonly collections: ReadonlyArray<{ readonly id: string; readonly displayName: string }>;
  readonly onChange: (configuration: unknown) => void;
}) {
  const record = configRecord(field);
  const set = (key: string, value: unknown) => onChange(setRecordValue(record, key, value));
  switch (field.kind) {
    case "short_text":
      return <CommonStringConfiguration record={record} defaultMaximum={500} onChange={onChange} />;
    case "long_text":
      return (
        <CommonStringConfiguration
          record={record}
          defaultMaximum={50_000}
          multilineDefault
          onChange={onChange}
        />
      );
    case "slug":
      return <CommonStringConfiguration record={record} defaultMaximum={200} onChange={onChange} />;
    case "url":
      return (
        <OptionalTextSetting
          id="config-url-default"
          label="Default URL"
          type="url"
          value={optionalString(record, "default")}
          onChange={(value) => set("default", value)}
        />
      );
    case "email":
      return (
        <OptionalTextSetting
          id="config-email-default"
          label="Default Email"
          type="email"
          value={optionalString(record, "default")}
          onChange={(value) => set("default", value)}
        />
      );
    case "number":
      return (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="config-number-mode">Number Mode</FieldLabel>
            <NativeSelect
              id="config-number-mode"
              name="config-number-mode"
              value={optionalString(record, "mode") || "floating_point"}
              onChange={(event) => set("mode", event.target.value)}
            >
              <NativeSelectOption value="integer">Integer</NativeSelectOption>
              <NativeSelectOption value="floating_point">Floating Point</NativeSelectOption>
            </NativeSelect>
            <FieldDescription>
              Use Exact Decimal or Money for values that must not round.
            </FieldDescription>
          </Field>
          <OptionalNumberSetting
            id="config-number-minimum"
            label="Minimum"
            value={optionalNumber(record, "minimum")}
            onChange={(value) => set("minimum", value)}
          />
          <OptionalNumberSetting
            id="config-number-maximum"
            label="Maximum"
            value={optionalNumber(record, "maximum")}
            onChange={(value) => set("maximum", value)}
          />
          <OptionalNumberSetting
            id="config-number-default"
            label="Default"
            value={optionalNumber(record, "default")}
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "decimal":
      return (
        <FieldGroup>
          <OptionalNumberSetting
            id="config-decimal-precision"
            label="Precision"
            description="Total digits, from 1 to 38."
            integer
            minimum={1}
            maximum={38}
            value={optionalNumber(record, "precision")}
            onChange={(value) => set("precision", value)}
          />
          <OptionalNumberSetting
            id="config-decimal-scale"
            label="Scale"
            description="Fractional digits, from 0 to 18."
            integer
            minimum={0}
            maximum={18}
            value={optionalNumber(record, "scale")}
            onChange={(value) => set("scale", value)}
          />
          <OptionalTextSetting
            id="config-decimal-minimum"
            label="Minimum"
            description="Stored as an exact base-10 string."
            inputMode="decimal"
            value={optionalString(record, "minimum")}
            onChange={(value) => set("minimum", value)}
          />
          <OptionalTextSetting
            id="config-decimal-maximum"
            label="Maximum"
            inputMode="decimal"
            value={optionalString(record, "maximum")}
            onChange={(value) => set("maximum", value)}
          />
          <OptionalTextSetting
            id="config-decimal-default"
            label="Default"
            inputMode="decimal"
            value={optionalString(record, "default")}
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "money": {
      const currencies = stringArray(record, "currencies");
      const defaultValue = isRecord(record.default) ? record.default : {};
      const defaultCurrency = optionalString(defaultValue, "currency");
      return (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="config-money-currencies">Allowed Currencies</FieldLabel>
            <Input
              id="config-money-currencies"
              name="config-money-currencies"
              value={currencies.join(", ")}
              spellCheck={false}
              autoComplete="off"
              translate="no"
              onChange={(event) =>
                set(
                  "currencies",
                  event.target.value
                    .split(",")
                    .map((currency) => currency.trim().toUpperCase())
                    .filter(Boolean),
                )
              }
            />
            <FieldDescription>
              Comma-separated ISO 4217 codes. Minor units come from the pinned registry.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="config-money-negative"
              checked={optionalBoolean(record, "allowNegative") ?? false}
              onCheckedChange={(checked) => set("allowNegative", checked === true || undefined)}
            />
            <FieldLabel htmlFor="config-money-negative">Allow Negative Amounts</FieldLabel>
          </Field>
          <OptionalTextSetting
            id="config-money-default-amount"
            label="Default Amount"
            description="Exact base-10 value; no rounding is applied."
            inputMode="decimal"
            value={optionalString(defaultValue, "amount")}
            onChange={(value) =>
              set(
                "default",
                value === undefined && !defaultCurrency
                  ? undefined
                  : { amount: value ?? "", currency: defaultCurrency },
              )
            }
          />
          <Field>
            <FieldLabel htmlFor="config-money-default-currency">Default Currency</FieldLabel>
            <NativeSelect
              id="config-money-default-currency"
              name="config-money-default-currency"
              value={defaultCurrency}
              onChange={(event) => {
                const amount = optionalString(defaultValue, "amount");
                set(
                  "default",
                  !amount && !event.target.value
                    ? undefined
                    : { amount, currency: event.target.value },
                );
              }}
            >
              <NativeSelectOption value="">No Default</NativeSelectOption>
              {currencies.map((currency) => (
                <NativeSelectOption key={currency} value={currency}>
                  {currency} ({Reflect.get(iso4217MinorUnits, currency) ?? "?"} minor units)
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>
      );
    }
    case "boolean":
      return (
        <OptionalBooleanSetting
          id="config-boolean-default"
          label="Default Value"
          value={optionalBoolean(record, "default")}
          onChange={(value) => set("default", value)}
        />
      );
    case "date":
      return (
        <FieldGroup>
          <OptionalTextSetting
            id="config-date-minimum"
            label="Earliest Date"
            type="date"
            value={optionalString(record, "minimum")}
            onChange={(value) => set("minimum", value)}
          />
          <OptionalTextSetting
            id="config-date-maximum"
            label="Latest Date"
            type="date"
            value={optionalString(record, "maximum")}
            onChange={(value) => set("maximum", value)}
          />
          <OptionalTextSetting
            id="config-date-default"
            label="Default Date"
            type="date"
            value={optionalString(record, "default")}
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "date_time":
      return (
        <FieldGroup>
          <OptionalDateTimeSetting
            id="config-datetime-minimum"
            label="Earliest Date & Time"
            value={optionalString(record, "minimum")}
            onChange={(value) => set("minimum", value)}
          />
          <OptionalDateTimeSetting
            id="config-datetime-maximum"
            label="Latest Date & Time"
            value={optionalString(record, "maximum")}
            onChange={(value) => set("maximum", value)}
          />
          <OptionalDateTimeSetting
            id="config-datetime-default"
            label="Default Date & Time"
            value={optionalString(record, "default")}
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "enum":
      return <EnumConfiguration record={record} onChange={onChange} />;
    case "json":
      return (
        <FieldGroup>
          <OptionalNumberSetting
            id="config-json-bytes"
            label="Maximum Bytes"
            integer
            value={optionalNumber(record, "maxBytes")}
            onChange={(value) => set("maxBytes", value)}
          />
          <OptionalNumberSetting
            id="config-json-depth"
            label="Maximum Depth"
            integer
            value={optionalNumber(record, "maxDepth")}
            onChange={(value) => set("maxDepth", value)}
          />
          <JsonSetting
            key={`${field.localId}-json-default`}
            id="config-json-default"
            label="Default JSON"
            value={record.default}
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "object":
      return (
        <JsonSetting
          key={`${field.localId}-object-default`}
          id="config-object-default"
          label="Default Object"
          value={record.default}
          expectedRoot="object"
          onChange={(value) => set("default", value)}
        />
      );
    case "list":
      return (
        <FieldGroup>
          <OptionalNumberSetting
            id="config-list-minimum"
            label="Minimum Items"
            integer
            value={optionalNumber(record, "minItems")}
            onChange={(value) => set("minItems", value)}
          />
          <OptionalNumberSetting
            id="config-list-maximum"
            label="Maximum Items"
            integer
            value={optionalNumber(record, "maxItems")}
            onChange={(value) => set("maxItems", value)}
          />
          <Field orientation="horizontal">
            <Checkbox
              id="config-list-unique"
              checked={optionalBoolean(record, "uniqueItems") ?? false}
              onCheckedChange={(checked) => set("uniqueItems", checked === true || undefined)}
            />
            <FieldLabel htmlFor="config-list-unique">Require Unique Items</FieldLabel>
          </Field>
          <JsonSetting
            key={`${field.localId}-list-default`}
            id="config-list-default"
            label="Default List"
            value={record.default}
            expectedRoot="array"
            onChange={(value) => set("default", value)}
          />
        </FieldGroup>
      );
    case "reference":
      return (
        <Field>
          <FieldLabel htmlFor="config-reference-target">Target Collection</FieldLabel>
          <NativeSelect
            id="config-reference-target"
            name="config-reference-target"
            value={optionalString(record, "targetCollectionId") || collectionId}
            onChange={(event) => set("targetCollectionId", event.target.value)}
          >
            {collections.map((collection) => (
              <NativeSelectOption key={collection.id} value={collection.id}>
                {collection.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      );
    case "external_asset": {
      const defaultValue = isRecord(record.default) ? record.default : undefined;
      return (
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="config-asset-default-enabled"
              checked={defaultValue !== undefined}
              onCheckedChange={(checked) =>
                set(
                  "default",
                  checked === true
                    ? {
                        source: "external",
                        url: "https://example.com/asset",
                        kind: "image",
                        title: null,
                        alt: null,
                        width: null,
                        height: null,
                      }
                    : undefined,
                )
              }
            />
            <FieldLabel htmlFor="config-asset-default-enabled">
              Configure a Default Asset
            </FieldLabel>
          </Field>
          {defaultValue ? (
            <FieldGroup>
              <OptionalTextSetting
                id="config-asset-url"
                label="Asset URL"
                type="url"
                value={optionalString(defaultValue, "url")}
                onChange={(value) => set("default", { ...defaultValue, url: value ?? "" })}
              />
              <Field>
                <FieldLabel htmlFor="config-asset-kind">Asset Kind</FieldLabel>
                <NativeSelect
                  id="config-asset-kind"
                  name="config-asset-kind"
                  value={optionalString(defaultValue, "kind") || "other"}
                  onChange={(event) =>
                    set("default", { ...defaultValue, kind: event.target.value })
                  }
                >
                  {[
                    ["image", "Image"],
                    ["video", "Video"],
                    ["audio", "Audio"],
                    ["document", "Document"],
                    ["archive", "Archive"],
                    ["other", "Other"],
                  ].map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <OptionalTextSetting
                id="config-asset-title"
                label="Title"
                value={optionalString(defaultValue, "title")}
                onChange={(value) => set("default", { ...defaultValue, title: value ?? null })}
              />
              <OptionalTextSetting
                id="config-asset-alt"
                label="Alternative Text"
                value={optionalString(defaultValue, "alt")}
                onChange={(value) => set("default", { ...defaultValue, alt: value ?? null })}
              />
              <OptionalNumberSetting
                id="config-asset-width"
                label="Width"
                integer
                minimum={1}
                maximum={100_000}
                value={optionalNumber(defaultValue, "width")}
                onChange={(value) => set("default", { ...defaultValue, width: value ?? null })}
              />
              <OptionalNumberSetting
                id="config-asset-height"
                label="Height"
                integer
                minimum={1}
                maximum={100_000}
                value={optionalNumber(defaultValue, "height")}
                onChange={(value) => set("default", { ...defaultValue, height: value ?? null })}
              />
            </FieldGroup>
          ) : null}
        </FieldGroup>
      );
    }
    case "rich_text":
      return (
        <FieldGroup>
          <CheckboxOptions
            legend="Block Styles"
            values={configuredRichTextValues(record, "styles", richTextStyleOptions)}
            options={richTextStyleOptions}
            onChange={(value) => set("styles", value)}
          />
          <CheckboxOptions
            legend="Decorators"
            values={configuredRichTextValues(record, "decorators", richTextDecoratorOptions)}
            options={richTextDecoratorOptions}
            onChange={(value) => set("decorators", value)}
          />
          <CheckboxOptions
            legend="List Types"
            values={configuredRichTextValues(record, "lists", richTextListOptions)}
            options={richTextListOptions}
            onChange={(value) => set("lists", value)}
          />
          <Field orientation="horizontal">
            <Checkbox
              id="config-rich-links"
              checked={optionalBoolean(record, "links") ?? true}
              onCheckedChange={(checked) => set("links", checked === true)}
            />
            <FieldLabel htmlFor="config-rich-links">Allow Links</FieldLabel>
          </Field>
          <OptionalNumberSetting
            id="config-rich-minimum"
            label="Minimum Text Length"
            integer
            value={optionalNumber(record, "minLength")}
            onChange={(value) => set("minLength", value)}
          />
          <OptionalNumberSetting
            id="config-rich-maximum"
            label="Maximum Text Length"
            integer
            value={optionalNumber(record, "maxLength")}
            onChange={(value) => set("maxLength", value)}
          />
          <RichTextDefaultSetting field={field} record={record} onChange={onChange} />
        </FieldGroup>
      );
  }
}

export function SchemaFieldInspector({
  field,
  parent,
  collectionId,
  collections,
  apiKeyConflict,
  issues,
  onChange,
}: SchemaFieldInspectorProps) {
  const listItem = parent?.kind === "list";
  const inheritedLocalization = parent !== undefined && parent.localization !== "mixed";
  const updateKind = (kind: CollectionFieldKind) => {
    if (kind === field.kind) return;
    if (
      field.children.length > 0 &&
      !globalThis.confirm("Changing the type removes all nested fields. Continue?")
    )
      return;
    const mixed = field.localization === "mixed" && kind === "object";
    onChange({
      ...field,
      kind,
      configuration: defaultFieldConfiguration(kind, collectionId),
      children: [],
      localization: mixed
        ? "mixed"
        : field.localization === "mixed"
          ? "localized"
          : field.localization,
      required: mixed ? null : (field.required ?? false),
    });
  };
  return (
    <FieldGroup>
      {issues.length > 0 ? (
        <Field data-invalid>
          <FieldError>
            <ul className="list-disc pl-4" aria-live="polite">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          </FieldError>
        </Field>
      ) : null}
      {!listItem ? (
        <Field>
          <FieldLabel htmlFor="field-display-label">Display Label</FieldLabel>
          <Input
            id="field-display-label"
            name="field-display-label"
            value={field.displayLabel ?? ""}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => onChange({ ...field, displayLabel: event.target.value })}
          />
          <FieldDescription>
            Labels may repeat; API keys must be unique among siblings.
          </FieldDescription>
        </Field>
      ) : null}
      {!listItem ? (
        <Field data-invalid={apiKeyConflict}>
          <FieldLabel htmlFor="field-api-key">API Key</FieldLabel>
          <Input
            id="field-api-key"
            name="field-api-key"
            value={field.apiKey ?? ""}
            maxLength={63}
            spellCheck={false}
            autoComplete="off"
            translate="no"
            aria-invalid={apiKeyConflict}
            onChange={(event) => onChange({ ...field, apiKey: event.target.value.toLowerCase() })}
          />
          <FieldDescription>Renaming a published key is breaking.</FieldDescription>
          <FieldError>
            {apiKeyConflict
              ? `The sibling API key “${field.apiKey}” is already in use. Choose a unique key.`
              : undefined}
          </FieldError>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="field-kind">Field Type</FieldLabel>
        <NativeSelect
          id="field-kind"
          name="field-kind"
          value={field.kind}
          onChange={(event) => {
            const option = fieldKindOptions.find(([kind]) => kind === event.target.value);
            if (option) updateKind(option[0]);
          }}
        >
          {fieldKindOptions.map(([value, label]) => (
            <NativeSelectOption key={value} value={value} disabled={listItem && value === "list"}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {!listItem && !inheritedLocalization ? (
        <Field>
          <FieldLabel htmlFor="field-localization">Localization</FieldLabel>
          <NativeSelect
            id="field-localization"
            name="field-localization"
            value={field.localization ?? "localized"}
            onChange={(event) => {
              const localization = event.target.value;
              if (
                localization !== "localized" &&
                localization !== "shared" &&
                localization !== "mixed"
              )
                return;
              onChange({
                ...field,
                localization,
                required: localization === "mixed" ? null : (field.required ?? false),
                configuration:
                  localization === "mixed" && isRecord(field.configuration)
                    ? setRecordValue(field.configuration, "default", undefined)
                    : field.configuration,
              });
            }}
          >
            <NativeSelectOption value="localized">Localized</NativeSelectOption>
            <NativeSelectOption value="shared">Shared</NativeSelectOption>
            {field.kind === "object" ? (
              <NativeSelectOption value="mixed">Mixed Object</NativeSelectOption>
            ) : null}
          </NativeSelect>
        </Field>
      ) : null}
      {!listItem && field.localization !== "mixed" ? (
        <Field orientation="horizontal">
          <Checkbox
            id="field-required"
            checked={field.required ?? false}
            onCheckedChange={(checked) => onChange({ ...field, required: checked === true })}
          />
          <FieldLabel htmlFor="field-required">Required</FieldLabel>
        </Field>
      ) : null}
      <Field orientation="horizontal">
        <Checkbox
          id="field-deprecated"
          checked={field.deprecated}
          onCheckedChange={(checked) => onChange({ ...field, deprecated: checked === true })}
        />
        <FieldLabel htmlFor="field-deprecated">Deprecated</FieldLabel>
      </Field>
      {!listItem ? (
        <>
          <OptionalTextSetting
            id="field-help-text"
            label="Help Text"
            value={field.editor.helpText ?? ""}
            onChange={(value) =>
              onChange({ ...field, editor: { ...field.editor, helpText: value ?? null } })
            }
          />
          <OptionalTextSetting
            id="field-placeholder"
            label="Placeholder"
            value={field.editor.placeholder ?? ""}
            onChange={(value) =>
              onChange({ ...field, editor: { ...field.editor, placeholder: value ?? null } })
            }
          />
          <FieldSet>
            <FieldLegend variant="label">Visible To Roles</FieldLegend>
            <FieldDescription>
              Owner and Developer must always be able to inspect the field.
            </FieldDescription>
            <FieldGroup className="gap-2">
              {roleOptions.map(([role, label]) => {
                const id = `field-visible-${role}`;
                return (
                  <Field key={role} orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={field.editor.visibleToRoles.includes(role)}
                      disabled={role === "owner" || role === "developer"}
                      onCheckedChange={(checked) => {
                        const visibleToRoles = roleOptions.flatMap(([candidate]) =>
                          candidate === role
                            ? checked === true
                              ? [candidate]
                              : []
                            : field.editor.visibleToRoles.includes(candidate)
                              ? [candidate]
                              : [],
                        );
                        const editableByRoles = field.editor.editableByRoles.filter((candidate) =>
                          visibleToRoles.includes(candidate),
                        );
                        onChange({
                          ...field,
                          editor: { ...field.editor, visibleToRoles, editableByRoles },
                        });
                      }}
                    />
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">Editable By Roles</FieldLegend>
            <FieldDescription>
              Editable roles must also be visible and possess content-write access.
            </FieldDescription>
            <FieldGroup className="gap-2">
              {roleOptions.map(([role, label]) => {
                const id = `field-editable-${role}`;
                const contentWriter = role !== "reviewer" && role !== "read_only";
                return (
                  <Field key={role} orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={field.editor.editableByRoles.includes(role)}
                      disabled={
                        role === "owner" ||
                        role === "developer" ||
                        !contentWriter ||
                        !field.editor.visibleToRoles.includes(role)
                      }
                      onCheckedChange={(checked) => {
                        const editableByRoles = roleOptions.flatMap(([candidate]) =>
                          candidate === role
                            ? checked === true
                              ? [candidate]
                              : []
                            : field.editor.editableByRoles.includes(candidate)
                              ? [candidate]
                              : [],
                        );
                        onChange({
                          ...field,
                          editor: { ...field.editor, editableByRoles },
                        });
                      }}
                    />
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
        </>
      ) : null}
      <FieldSet className="border-t pt-5">
        <FieldLegend>Type Configuration</FieldLegend>
        <TypeConfiguration
          field={field}
          collectionId={collectionId}
          collections={collections}
          onChange={(configuration) => onChange({ ...field, configuration })}
        />
      </FieldSet>
    </FieldGroup>
  );
}
