/** @vitest-environment jsdom */

import { DeliveryCollectionConfiguration } from "@framerfordevs/api/contracts/delivery/index";
import { CollectionFieldDefinition } from "@framerfordevs/api/contracts/schema/index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { CodeManagedStructureCard, DeliveryConfigurationCard } from "./index";

const ids = {
  project: "019fae8b-1234-7000-8000-000000000001",
  environment: "019fae8b-1234-7000-8000-000000000002",
  collection: "019fae8b-1234-7000-8000-000000000003",
  title: "019fae8b-1234-7000-8000-000000000004",
  visible: "019fae8b-1234-7000-8000-000000000005",
};
const editor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
};
const fields = [
  Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: ids.title,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "title",
    displayLabel: "Title",
    kind: "short_text",
    required: true,
    localization: "localized",
    deprecated: false,
    position: 0,
    editor,
    configuration: {},
    children: [],
  }),
  Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: ids.visible,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "visible",
    displayLabel: "Visible",
    kind: "boolean",
    required: false,
    localization: "shared",
    deprecated: false,
    position: 1,
    editor,
    configuration: {},
    children: [],
  }),
];
const configuration = Schema.decodeUnknownSync(DeliveryCollectionConfiguration)({
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  collectionKey: "articles",
  access: "protected",
  version: 1,
  fields: [],
  updatedByUserId: "delivery-ui-owner",
  updatedByCredentialId: null,
  updatedAt: "2026-08-09T12:00:00.000Z",
});

function renderConfiguration(canConfigure = true, hasPublishedSchema = true) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DeliveryConfigurationCard
        scope={{
          projectId: ids.project,
          environmentId: ids.environment,
          collectionId: ids.collection,
        }}
        configuration={configuration}
        publishedFields={fields}
        hasPublishedSchema={hasPublishedSchema}
        canConfigure={canConfigure}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("code-managed collection structure", () => {
  it("shows current code-managed fields without structure mutation controls", () => {
    render(<CodeManagedStructureCard fields={fields} revisionId={ids.collection} />);

    expect(screen.getByRole("heading", { name: "Structure is managed in code" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Current managed fields" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /add field|save schema|publish schema/i }),
    ).toBeNull();
  });
});

describe("Delivery configuration", () => {
  it("requires the irreversible public-access acknowledgement and exposes kind-safe capabilities", async () => {
    const user = userEvent.setup();
    const { container } = renderConfiguration();

    await user.selectOptions(screen.getByLabelText("Collection access"), "public");
    const save = screen.getByRole("button", { name: "Save Delivery settings" });
    expect(Reflect.get(save, "disabled")).toBe(true);
    const acknowledgement = screen.getByRole("checkbox", {
      name: /external caches cannot be revoked/u,
    });
    expect(acknowledgement.getAttribute("aria-checked")).toBe("false");
    await user.click(acknowledgement);
    expect(Reflect.get(save, "disabled")).toBe(false);
    const booleanUnique = container.querySelector(`#delivery-${ids.visible}-uniqueLookup`);
    expect(Reflect.get(booleanUnique ?? {}, "disabled")).toBe(true);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("disables Delivery settings until the first schema publication", () => {
    renderConfiguration(true, false);

    expect(Reflect.get(screen.getByLabelText("Collection access"), "disabled")).toBe(true);
    expect(
      Reflect.get(screen.getByRole("button", { name: "Save Delivery settings" }), "disabled"),
    ).toBe(true);
  });

  it("keeps Delivery exposure read-only for unauthorized roles", () => {
    renderConfiguration(false);

    expect(Reflect.get(screen.getByLabelText("Collection access"), "disabled")).toBe(true);
    expect(
      Reflect.get(screen.getByRole("button", { name: "Save Delivery settings" }), "disabled"),
    ).toBe(true);
    expect(screen.getByText(/Owner or unrestricted developer access/u)).toBeTruthy();
  });
});
