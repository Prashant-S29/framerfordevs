import { assert, describe, it } from "@effect/vitest";

import { decideLocaleTransition } from "./index";

const noDependencies = {
  draftCount: 0,
  currentPublicationCount: 0,
  draftCountCapped: false,
  currentPublicationCountCapped: false,
};

describe("locale transition policy", () => {
  it("allows the documented reversible lifecycle transitions", () => {
    const transitions = [
      ["enabled", "disabled"],
      ["enabled", "removed"],
      ["disabled", "enabled"],
      ["disabled", "removed"],
      ["removed", "enabled"],
    ] as const;

    for (const [currentStatus, requestedStatus] of transitions) {
      assert.strictEqual(
        decideLocaleTransition({
          currentStatus,
          requestedStatus,
          isEnglish: false,
          confirmDraftImpact: false,
          dependencies: noDependencies,
        }).kind,
        "allowed",
      );
    }
  });

  it("returns no-change without creating transition noise", () => {
    for (const status of ["enabled", "disabled", "removed"] as const) {
      assert.strictEqual(
        decideLocaleTransition({
          currentStatus: status,
          requestedStatus: status,
          isEnglish: status === "enabled",
          confirmDraftImpact: false,
          dependencies: noDependencies,
        }).kind,
        "no_change",
      );
    }
  });

  it("permanently rejects English withdrawal and removed-to-disabled transitions", () => {
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "enabled",
        requestedStatus: "disabled",
        isEnglish: true,
        confirmDraftImpact: true,
        dependencies: noDependencies,
      }).kind,
      "invalid",
    );
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "removed",
        requestedStatus: "disabled",
        isEnglish: false,
        confirmDraftImpact: true,
        dependencies: noDependencies,
      }).kind,
      "invalid",
    );
  });

  it("never lets confirmation override a current publication", () => {
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "enabled",
        requestedStatus: "removed",
        isEnglish: false,
        confirmDraftImpact: true,
        dependencies: {
          ...noDependencies,
          currentPublicationCount: 1,
        },
      }).kind,
      "dependencies",
    );
  });

  it("requires explicit confirmation for drafts and preserves allowed restoration", () => {
    const dependencies = { ...noDependencies, draftCount: 3 };
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "enabled",
        requestedStatus: "disabled",
        isEnglish: false,
        confirmDraftImpact: false,
        dependencies,
      }).kind,
      "dependencies",
    );
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "enabled",
        requestedStatus: "disabled",
        isEnglish: false,
        confirmDraftImpact: true,
        dependencies,
      }).kind,
      "allowed",
    );
    assert.strictEqual(
      decideLocaleTransition({
        currentStatus: "removed",
        requestedStatus: "enabled",
        isEnglish: false,
        confirmDraftImpact: false,
        dependencies,
      }).kind,
      "allowed",
    );
  });
});
