// Defines the allowlisted React components available to source-controlled public MDX pages.

import { CodeBlock, Pre, type CodeBlockProps } from "fumadocs-ui/components/codeblock";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { isValidElement, type ReactNode } from "react";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (isValidElement<{ readonly children?: ReactNode }>(node)) {
    return textContent(node.props.children);
  }
  return "";
}

function AccessibleCodeBlock({ children, viewportProps, ...props }: CodeBlockProps) {
  const snippet = textContent(children).trim().split("\n", 1)[0]?.slice(0, 72);
  const label =
    typeof props.title === "string"
      ? props.title
      : `Code example${snippet === undefined || snippet.length === 0 ? "" : `: ${snippet}`}`;

  return (
    <CodeBlock
      {...props}
      viewportProps={{
        ...viewportProps,
        "aria-label": label,
      }}
    >
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    pre: AccessibleCodeBlock,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
