// Renders source-controlled MDX through the shared Fumadocs layout and serialized public page tree.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { Suspense, use } from "react";

import { useMDXComponents } from "@/components/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { docs, source } from "@/lib/source";

export const Route = createFileRoute("/docs/$")({
  component: DocumentationPage,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loadDocumentationPage({ data: slugs });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData }) => ({
    meta:
      loaderData === undefined
        ? []
        : [
            { title: `${loaderData.title} — Framer for Devs` },
            { name: "description", content: loaderData.description },
          ],
  }),
});

const loadDocumentationPage = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (page === undefined) throw notFound();

    return {
      description: page.data.description ?? "Framer for Devs developer documentation.",
      pageTree: await source.serializePageTree(source.getPageTree()),
      path: page.path,
      title: page.data.title,
    };
  });

function DocumentationContent({ path }: { readonly path: string }) {
  const page = docs.getPage(path);
  if (page === undefined) throw new Error(`Unknown public documentation page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc} tableOfContent={{ style: "clerk" }}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        <MDX components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function DocumentationPage() {
  const data = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={data.pageTree} sidebar={{ defaultOpenLevel: 1 }}>
      <Suspense fallback={<p className="p-8 text-sm text-fd-muted-foreground">Loading…</p>}>
        <DocumentationContent path={data.path} />
      </Suspense>
    </DocsLayout>
  );
}
