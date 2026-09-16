import { expect, type Page } from "@playwright/test";

export function observeRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
  });

  return {
    expectNone() {
      expect(errors, "The browser emitted unexpected runtime errors.").toEqual([]);
    },
  };
}
