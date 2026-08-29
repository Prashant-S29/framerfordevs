/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PortableTextField from "./index";

afterEach(cleanup);

describe("portable text field", () => {
  it("renders only configured rich-text controls", () => {
    render(
      <PortableTextField
        label="Body"
        value={undefined}
        disabled={false}
        configuration={{
          styles: ["normal"],
          decorators: ["strong"],
          lists: ["bullet"],
          links: false,
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "normal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "strong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "bullet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "h2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "em" })).toBeNull();
    expect(screen.queryByRole("button", { name: "number" })).toBeNull();
  });

  it("hydrates only canonical saved documents", async () => {
    render(
      <PortableTextField
        label="Body"
        value={{ version: 1, profile: "wrong", blocks: [] }}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Saved body")).toBeNull();
    cleanup();

    render(
      <PortableTextField
        label="Body"
        value={{
          version: 1,
          profile: "ffd-portable-text",
          blocks: [
            {
              _key: "block-1",
              _type: "block",
              style: "normal",
              children: [{ _key: "span-1", _type: "span", text: "Saved body", marks: [] }],
              markDefs: [],
            },
          ],
        }}
        disabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Saved body")).toBeTruthy();
  });
});
