// Renders lazy, read-only API contracts from server-loaded canonical OpenAPI artifacts.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";

import { ApiContractPage } from "@/components/api-contract-page";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/api-reference/$")({
  component: ApiReferencePage,
  loader: ({ params }) => loadApiReference({ data: params._splat?.split("/") ?? [] }),
  head: ({ loaderData }) => ({
    meta:
      loaderData === undefined
        ? []
        : [
            { title: `${loaderData.title} — API Contracts` },
            { name: "description", content: loaderData.description },
          ],
  }),
});

const loadApiReference = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const { apiContractSource } = await import("@/lib/api-contracts.server");
    const page = apiContractSource.getPage(slugs);
    if (page === undefined) throw notFound();

    return {
      description: page.data.description ?? "Canonical public API contract.",
      pageTree: await apiContractSource.serializePageTree(apiContractSource.getPageTree()),
      props: page.data.getOpenAPIPageProps(),
      title: page.data.title,
    };
  });

function ApiReferencePage() {
  const data = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout {...baseOptions()} tree={data.pageTree}>
      <DocsPage full>
        <DocsTitle>{data.title}</DocsTitle>
        <DocsDescription>{data.description}</DocsDescription>
        <DocsBody>
          <p className="mb-8 rounded-lg border bg-fd-muted/50 p-4 text-sm text-fd-muted-foreground">
            This read-only reference is generated from the same canonical OpenAPI artifact served by
            the API. Use the task-oriented documentation for setup and product workflows.
          </p>
          <ApiContractPage {...data.props} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
