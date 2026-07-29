/** @vitest-environment jsdom */

import { Project } from "@framerfordevs/api/contracts/platform";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Schema } from "effect";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ArchiveProjectDialog } from "./archive-project-dialog";
import { CreateProjectDialog } from "./create-project-dialog";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { EditProjectDialog } from "./edit-project-dialog";

const project = Schema.decodeUnknownSync(Project)({
  id: "019fae8b-1234-7000-8000-000000000001",
  workspaceId: "019fae8b-1234-7000-8000-000000000002",
  name: "Accessible project",
  key: "accessible-project",
  description: "A project used for accessibility checks.",
  version: 1,
  archivedAt: null,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
  environment: {
    id: "019fae8b-1234-7000-8000-000000000003",
    workspaceId: "019fae8b-1234-7000-8000-000000000002",
    projectId: "019fae8b-1234-7000-8000-000000000001",
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
  capabilities: [],
});

function renderWithQueryClient(component: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{component}</QueryClientProvider>);
}

async function expectOpenDialogToHaveNoViolations(
  triggerName: RegExp,
  role: "alertdialog" | "dialog" = "dialog",
) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: triggerName }));
  const dialog = await screen.findByRole(role);
  expect((await axe.run(dialog)).violations).toEqual([]);
}

afterEach(cleanup);

describe("platform management accessibility", () => {
  it("has accessible workspace creation semantics", async () => {
    renderWithQueryClient(<CreateWorkspaceDialog />);
    await expectOpenDialogToHaveNoViolations(/new workspace/i);
  });

  it("has accessible project creation semantics", async () => {
    renderWithQueryClient(
      <CreateProjectDialog workspaceId={project.workspaceId} onCreated={() => undefined} />,
    );
    await expectOpenDialogToHaveNoViolations(/new project/i);
  });

  it("has accessible project editing semantics", async () => {
    renderWithQueryClient(<EditProjectDialog project={project} />);
    await expectOpenDialogToHaveNoViolations(/edit project/i);
  });

  it("has accessible destructive-confirmation semantics", async () => {
    renderWithQueryClient(<ArchiveProjectDialog project={project} />);
    await expectOpenDialogToHaveNoViolations(/archive project/i, "alertdialog");
  });
});
