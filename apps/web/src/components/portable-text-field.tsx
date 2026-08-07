// Adapts the approved Portable Text profile to the official editor without storing editor-native state.

import {
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  useEditor,
} from "@portabletext/editor";
import type { RenderDecoratorFunction, RenderStyleFunction } from "@portabletext/editor";
import { EventListenerPlugin } from "@portabletext/editor/plugins";

import { Button } from "@framerfordevs/ui/components/button";

const schemaDefinition = defineSchema({
  decorators: [
    { name: "strong" },
    { name: "em" },
    { name: "underline" },
    { name: "strike-through" },
    { name: "code" },
  ],
  styles: [
    { name: "normal" },
    { name: "h2" },
    { name: "h3" },
    { name: "h4" },
    { name: "h5" },
    { name: "h6" },
    { name: "blockquote" },
  ],
  annotations: [{ name: "link", fields: [{ name: "href", type: "string" }] }],
  lists: [{ name: "bullet" }, { name: "number" }],
  inlineObjects: [],
  blockObjects: [],
});

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

function Toolbar() {
  const editor = useEditor();
  return (
    <div className="flex flex-wrap gap-1 border-b p-2" role="toolbar" aria-label="Text formatting">
      {schemaDefinition.decorators.map((decorator) => (
        <Button
          key={decorator.name}
          type="button"
          size="sm"
          variant="ghost"
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
          onClick={() => {
            editor.send({ type: "style.toggle", style: style.name });
            editor.send({ type: "focus" });
          }}
        >
          {style.name}
        </Button>
      ))}
    </div>
  );
}

export default function PortableTextField({
  label,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onChange: (value: unknown) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <EditorProvider
        initialConfig={{ schemaDefinition, initialValue: undefined, readOnly: disabled }}
      >
        <EventListenerPlugin
          on={(event) => {
            if (event.type === "mutation") {
              onChange({ version: 1, profile: "ffd-portable-text", blocks: event.value });
            }
          }}
        />
        <Toolbar />
        <PortableTextEditable
          aria-label={label}
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
