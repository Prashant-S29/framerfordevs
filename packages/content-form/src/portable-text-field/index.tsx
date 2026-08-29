// Adapts the approved Portable Text profile to the official editor without app or server imports.

import {
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  useEditor,
} from "@portabletext/editor";
import type {
  PortableTextBlock as EditorPortableTextBlock,
  RenderDecoratorFunction,
  RenderStyleFunction,
} from "@portabletext/editor";
import { EventListenerPlugin } from "@portabletext/editor/plugins";
import { Button } from "@framerfordevs/ui/components/button";
import { Option, Schema } from "effect";

import type { RichTextConfiguration } from "../model";

const portableTextKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);
const portableTextSpan = Schema.Struct({
  _key: portableTextKey,
  _type: Schema.Literal("span"),
  text: Schema.String.pipe(Schema.maxLength(100_000)),
  marks: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))).pipe(
    Schema.maxItems(32),
  ),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const portableTextLink = Schema.Struct({
  _key: portableTextKey,
  _type: Schema.Literal("link"),
  href: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const portableTextBlock = Schema.Struct({
  _key: portableTextKey,
  _type: Schema.Literal("block"),
  style: Schema.Literal("normal", "h2", "h3", "h4", "h5", "h6", "blockquote"),
  listItem: Schema.optionalWith(Schema.Literal("bullet", "number"), { exact: true }),
  level: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 3)), {
    exact: true,
  }),
  children: Schema.Array(portableTextSpan).pipe(Schema.maxItems(5_000)),
  markDefs: Schema.Array(portableTextLink).pipe(Schema.maxItems(1_000)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const portableTextDocument = Schema.Struct({
  version: Schema.Literal(1),
  profile: Schema.Literal("ffd-portable-text"),
  blocks: Schema.Array(portableTextBlock).pipe(Schema.maxItems(500)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });

const defaultDecorators = ["strong", "em", "underline", "strike-through", "code"] as const;
const defaultStyles = ["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"] as const;
const defaultLists = ["bullet", "number"] as const;

function makeSchemaDefinition(configuration?: RichTextConfiguration) {
  return defineSchema({
    decorators: (configuration?.decorators ?? defaultDecorators).map((name) => ({ name })),
    styles: (configuration?.styles ?? defaultStyles).map((name) => ({ name })),
    annotations:
      configuration?.links === false
        ? []
        : [{ name: "link", fields: [{ name: "href", type: "string" }] }],
    lists: (configuration?.lists ?? defaultLists).map((name) => ({ name })),
    inlineObjects: [],
    blockObjects: [],
  });
}

const renderStyle: RenderStyleFunction = ({ children, schemaType }) => {
  switch (schemaType.value) {
    case "h2":
      return <h2 className="text-xl font-semibold">{children}</h2>;
    case "h3":
      return <h3 className="text-lg font-semibold">{children}</h3>;
    case "h4":
    case "h5":
    case "h6":
      return <h4 className="font-semibold">{children}</h4>;
    case "blockquote":
      return <blockquote className="border-l-2 pl-3 italic">{children}</blockquote>;
    default:
      return <p>{children}</p>;
  }
};

const renderDecorator: RenderDecoratorFunction = ({ children, value }) => {
  switch (value) {
    case "strong":
      return <strong>{children}</strong>;
    case "em":
      return <em>{children}</em>;
    case "underline":
      return <u>{children}</u>;
    case "strike-through":
      return <s>{children}</s>;
    case "code":
      return <code>{children}</code>;
    default:
      return <>{children}</>;
  }
};

function Toolbar({
  disabled,
  schemaDefinition,
}: {
  readonly disabled: boolean;
  readonly schemaDefinition: ReturnType<typeof makeSchemaDefinition>;
}) {
  const editor = useEditor();
  return (
    <div className="flex flex-wrap gap-1 border-b p-2" role="toolbar" aria-label="Text formatting">
      {schemaDefinition.decorators.map((decorator) => (
        <Button
          key={decorator.name}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            editor.send({ type: "decorator.toggle", decorator: decorator.name });
            editor.send({ type: "focus" });
          }}
        >
          {decorator.name}
        </Button>
      ))}
      {schemaDefinition.styles.map((style) => (
        <Button
          key={style.name}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            editor.send({ type: "style.toggle", style: style.name });
            editor.send({ type: "focus" });
          }}
        >
          {style.name}
        </Button>
      ))}
      {schemaDefinition.lists.map((list) => (
        <Button
          key={list.name}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            editor.send({ type: "list item.toggle", listItem: list.name });
            editor.send({ type: "focus" });
          }}
        >
          {list.name}
        </Button>
      ))}
    </div>
  );
}

export interface PortableTextFieldProps {
  readonly label: string;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly configuration?: RichTextConfiguration;
  readonly ariaDescribedBy?: string;
  readonly onChange: (value: unknown) => void;
}

export default function PortableTextField({
  label,
  value,
  disabled,
  configuration,
  ariaDescribedBy,
  onChange,
}: PortableTextFieldProps) {
  const decoded = Schema.decodeUnknownOption(portableTextDocument)(value);
  const initialValue: Array<EditorPortableTextBlock> | undefined = Option.isSome(decoded)
    ? decoded.value.blocks.map((block) => ({
        ...block,
        children: block.children.map((child) => ({ ...child, marks: [...child.marks] })),
        markDefs: block.markDefs.map((mark) => ({ ...mark })),
      }))
    : undefined;
  const schemaDefinition = makeSchemaDefinition(configuration);
  const schemaKey = JSON.stringify({
    decorators: schemaDefinition.decorators.map(({ name }) => name),
    styles: schemaDefinition.styles.map(({ name }) => name),
    lists: schemaDefinition.lists.map(({ name }) => name),
    links: schemaDefinition.annotations.length > 0,
  });
  return (
    <div className="overflow-hidden rounded-md border">
      <EditorProvider
        key={schemaKey}
        initialConfig={{ schemaDefinition, initialValue, readOnly: disabled }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === "mutation") {
              onChange({ version: 1, profile: "ffd-portable-text", blocks: event.value });
            }
          }}
        />
        <Toolbar disabled={disabled} schemaDefinition={schemaDefinition} />
        <PortableTextEditable
          aria-label={label}
          aria-describedby={ariaDescribedBy}
          className="min-h-32 p-3 focus:outline-none"
          renderStyle={renderStyle}
          renderDecorator={renderDecorator}
          renderBlock={({ children }) => <div>{children}</div>}
          renderListItem={({ children }) => <>{children}</>}
        />
      </EditorProvider>
    </div>
  );
}
