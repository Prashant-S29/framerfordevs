// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPreviewPanel, studioPreviewEnabled, studioPreviewLaunchPath } from ".";

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  entry: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
};

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

function panel(overrides: Partial<Parameters<typeof StudioPreviewPanel>[0]> = {}) {
  const props = {
    mountPath: "/studio",
    collectionId: ids.collection,
    locale: "en",
    entryId: ids.entry,
    entryName: "Launch post",
    open: true,
    selection: { revisionId: null, label: "the last saved draft" },
    savedVersion: "1:1",
    onOpenChange: vi.fn(),
    onShowCurrent: vi.fn(),
    ...overrides,
  };
  return { props, view: render(<StudioPreviewPanel {...props} />) };
}

describe("Studio Preview panel", () => {
  it("reads the server preview flag", () => {
    expect(studioPreviewEnabled()).toBe(false);
    document.head.innerHTML = '<meta name="ffd-studio-preview" content="enabled">';
    expect(studioPreviewEnabled()).toBe(true);
  });

  it("frames only the same-origin launch route in a sandbox without a token", async () => {
    const { view } = panel();
    const frame = screen.getByTitle("Preview of Launch post");
    expect(frame.getAttribute("src")).toBe(
      `/studio/preview/launch?collection=${ids.collection}&locale=en&entry=${ids.entry}`,
    );
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(view.container.innerHTML).not.toContain("ffd_pvh_");
    expect(screen.getByText(/last saved draft/u)).toBeTruthy();
    const results = await axe.run(view.container, { iframes: false });
    expect(results.violations).toEqual([]);
  });

  it("previews a revision and returns to the current draft", () => {
    const { props } = panel({
      selection: { revisionId: ids.revision, label: "English revision 4" },
    });
    expect(screen.getByTitle("Preview of Launch post").getAttribute("src")).toBe(
      studioPreviewLaunchPath({ ...props, revisionId: ids.revision }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview the current draft" }));
    expect(props.onShowCurrent).toHaveBeenCalledOnce();
  });

  it("asks for a reload after a save and clears the notice on reload", () => {
    const { props, view } = panel();
    view.rerender(<StudioPreviewPanel {...props} savedVersion="1:2" />);
    expect(screen.getByRole("status").textContent).toContain("Reload the preview");
    fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
