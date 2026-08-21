/** @vitest-environment jsdom */

import { WebhookEndpoint } from "@framerfordevs/api/contracts/webhooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const submittedInputs: Array<{ readonly operation: string; readonly input: unknown }> = [];
const issuedSecret = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ids = {
  project: "019fae8b-1234-7000-8000-000000000001",
  environment: "019fae8b-1234-7000-8000-000000000002",
  collection: "019fae8b-1234-7000-8000-000000000003",
  entry: "019fae8b-1234-7000-8000-000000000004",
  locale: "019fae8b-1234-7000-8000-000000000005",
  endpoint: "019fae8b-1234-7000-8000-000000000006",
};

interface MutationCallbacks {
  readonly onSuccess?: (response: {
    readonly ok: true;
    readonly data: unknown;
    readonly error: null;
    readonly message: string;
  }) => Promise<void> | void;
}

function mutationOptions(
  operation: string,
  data: unknown,
  message: string,
  callbacks: MutationCallbacks,
) {
  return {
    ...callbacks,
    mutationFn: async (input: unknown) => {
      submittedInputs.push({ operation, input });
      const response = { ok: true as const, data, error: null, message };
      await callbacks.onSuccess?.(response);
      return response;
    },
  };
}

vi.mock("@/utils/orpc", () => ({
  orpc: {
    webhooks: {
      endpoints: {
        create: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions(
              "endpoint.create",
              { endpoint: { id: ids.endpoint }, secret: issuedSecret },
              "Webhook endpoint created. Copy the signing secret now.",
              callbacks,
            ),
        },
        update: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("endpoint.update", {}, "Endpoint updated.", callbacks),
        },
        setState: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("endpoint.state", {}, "Endpoint state updated.", callbacks),
        },
        replaceSubscriptions: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("endpoint.subscriptions", {}, "Subscriptions updated.", callbacks),
        },
        startRotation: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions(
              "endpoint.rotation.start",
              { secret: issuedSecret },
              "Next secret generated.",
              callbacks,
            ),
        },
        changeRotation: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("endpoint.rotation.change", {}, "Rotation updated.", callbacks),
        },
        list: { key: () => ["webhook-endpoints"] },
      },
      mappings: {
        create: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("mapping.create", {}, "Mapping created.", callbacks),
        },
        update: {
          mutationOptions: (callbacks: MutationCallbacks) =>
            mutationOptions("mapping.update", {}, "Mapping updated.", callbacks),
        },
        list: { key: () => ["webhook-mappings"] },
      },
    },
    platform: {
      projects: {
        collections: {
          list: {
            infiniteOptions: (options: {
              readonly initialPageParam: null;
              readonly getNextPageParam: (page: {
                readonly data: { readonly nextCursor: null };
              }) => undefined;
            }) => ({
              queryKey: ["collections"],
              queryFn: async () => ({
                data: {
                  items: [{ id: ids.collection, displayName: "Articles" }],
                  nextCursor: null,
                },
              }),
              initialPageParam: options.initialPageParam,
              getNextPageParam: options.getNextPageParam,
            }),
          },
          entries: {
            list: {
              infiniteOptions: (options: {
                readonly initialPageParam: null;
                readonly getNextPageParam: (page: {
                  readonly data: { readonly nextCursor: null };
                }) => undefined;
              }) => ({
                queryKey: ["entries"],
                queryFn: async () => ({
                  data: {
                    items: [{ entry: { id: ids.entry }, displayName: "Homepage" }],
                    nextCursor: null,
                  },
                }),
                initialPageParam: options.initialPageParam,
                getNextPageParam: options.getNextPageParam,
              }),
            },
          },
        },
        locales: {
          list: {
            queryOptions: () => ({
              queryKey: ["locales"],
              queryFn: async () => ({
                data: {
                  items: [
                    {
                      id: ids.locale,
                      tag: "en",
                      displayName: "English",
                    },
                  ],
                },
              }),
            }),
          },
        },
      },
    },
  },
}));

import {
  CreateInvalidationMappingDialog,
  CreateWebhookEndpointDialog,
  WebhookEndpointActions,
} from "./webhook-controls";

function renderWithQueryClient(component: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {component}
    </QueryClientProvider>,
  );
}

const endpoint = Schema.decodeUnknownSync(WebhookEndpoint)({
  id: ids.endpoint,
  projectId: ids.project,
  environmentId: ids.environment,
  name: "Publication receiver",
  state: "enabled",
  version: 2,
  destinationOrigin: "https://hooks.example.test",
  subscriptions: ["cms.schema.published", "cms.entry.published"],
  rotationState: "active",
  rotationEndsAt: null,
  lastOutcome: null,
  deadLetterCount: 0,
  enabledAt: "2026-08-13T00:00:00.000Z",
  disabledAt: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
});

afterEach(() => {
  cleanup();
  submittedInputs.length = 0;
});

describe("webhook controls", () => {
  it("validates destination authority and permanently dismisses one-time disclosure", async () => {
    const user = userEvent.setup();
    const view = renderWithQueryClient(
      <CreateWebhookEndpointDialog projectId={ids.project} environmentId={ids.environment} />,
    );
    await user.click(screen.getByRole("button", { name: /new endpoint/i }));
    await user.type(screen.getByLabelText(/endpoint name/i), "Publication receiver");
    await user.type(screen.getByLabelText(/destination url/i), "http://localhost:8080/hook");
    await user.tab();
    expect(screen.getByText(/canonical HTTPS URL on port 443/i)).toBeTruthy();
    const submit = screen.getByRole("button", { name: /create endpoint/i });
    expect(submit.hasAttribute("disabled")).toBe(true);

    await user.clear(screen.getByLabelText(/destination url/i));
    await user.type(
      screen.getByLabelText(/destination url/i),
      "https://hooks.example.test/private-token",
    );
    await user.click(
      screen.getByLabelText(/authorize environment-wide publication notifications/i),
    );
    expect(submit.hasAttribute("disabled")).toBe(false);
    await user.click(submit);

    expect(await screen.findByText(issuedSecret)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /copy secret/i }));
    expect(await screen.findByRole("button", { name: /copied/i })).toBeTruthy();
    const finish = screen.getByRole("button", { name: /finish/i });
    expect(finish.hasAttribute("disabled")).toBe(true);
    expect((await axe.run(screen.getByRole("dialog"))).violations).toEqual([]);
    await user.click(screen.getByLabelText(/stored this secret securely/i));
    await user.click(finish);
    expect(screen.queryByText(issuedSecret)).toBeNull();
    expect(submittedInputs).toContainEqual({
      operation: "endpoint.create",
      input: {
        projectId: ids.project,
        environmentId: ids.environment,
        name: "Publication receiver",
        destination: "https://hooks.example.test/private-token",
        subscriptions: ["cms.schema.published", "cms.entry.published", "cms.entry.unpublished"],
        authorityAcknowledged: true,
      },
    });

    await user.click(screen.getByRole("button", { name: /new endpoint/i }));
    expect(screen.queryByText(issuedSecret)).toBeNull();
    expect((await axe.run(view.container)).violations).toEqual([]);
  });

  it("requires consequences to be reviewed for destination, subscription, and disable changes", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <WebhookEndpointActions
        projectId={ids.project}
        environmentId={ids.environment}
        endpoint={endpoint}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit endpoint/i }));
    await user.type(
      screen.getByLabelText(/replacement destination/i),
      "https://next.example.test/hook",
    );
    const save = screen.getByRole("button", { name: /save endpoint/i });
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByLabelText(/destination replacement cancels queued/i));
    await user.click(save);
    await waitFor(() =>
      expect(submittedInputs.some((item) => item.operation === "endpoint.update")).toBe(true),
    );

    await user.click(screen.getByRole("button", { name: /edit subscriptions/i }));
    await user.click(screen.getByLabelText("cms.schema.published"));
    expect(screen.getByRole("alert").textContent).toContain("cms.schema.published");
    await user.click(screen.getByRole("button", { name: /confirm subscriptions/i }));
    await waitFor(() =>
      expect(submittedInputs).toContainEqual({
        operation: "endpoint.subscriptions",
        input: {
          projectId: ids.project,
          environmentId: ids.environment,
          endpointId: ids.endpoint,
          expectedVersion: 2,
          subscriptions: ["cms.entry.published"],
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: /^disable$/i }));
    const alert = screen.getByRole("alertdialog");
    expect(alert.textContent).toMatch(/in-flight delivery may still complete/i);
    expect((await axe.run(alert)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: /disable endpoint/i }));
    await waitFor(() =>
      expect(submittedInputs.some((item) => item.operation === "endpoint.state")).toBe(true),
    );
  });

  it("creates an exact entry and locale mapping with read-only system tags", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <CreateInvalidationMappingDialog projectId={ids.project} environmentId={ids.environment} />,
    );
    await user.click(screen.getByRole("button", { name: /new mapping/i }));
    await user.type(screen.getByLabelText(/mapping name/i), "Article page");
    await user.selectOptions(await screen.findByLabelText(/collection/i), ids.collection);
    await user.selectOptions(await screen.findByLabelText(/exact entry/i), ids.entry);
    await user.selectOptions(screen.getByLabelText(/exact locale/i), ids.locale);

    expect(screen.getByLabelText("cms.schema.published").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(`entry:${ids.entry}`)).toBeTruthy();
    expect(screen.getByText(`locale:${ids.locale}`)).toBeTruthy();

    await user.type(screen.getByLabelText(/exact route path/i), "/articles/homepage");
    await user.type(screen.getByLabelText(/semantic tags/i), "content:article, page:home");
    const dialog = screen.getByRole("dialog");
    expect((await axe.run(dialog)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: /create mapping/i }));
    await waitFor(() =>
      expect(submittedInputs).toContainEqual({
        operation: "mapping.create",
        input: {
          projectId: ids.project,
          environmentId: ids.environment,
          collectionId: ids.collection,
          entryId: ids.entry,
          localeId: ids.locale,
          name: "Article page",
          eventTypes: ["cms.entry.published", "cms.entry.unpublished"],
          route: "/articles/homepage",
          semanticTags: ["content:article", "page:home"],
        },
      }),
    );
  });
});
