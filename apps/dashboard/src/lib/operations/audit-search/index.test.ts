import { describe, expect, it } from "vitest";

import { auditFiltersFromSearch, toLocalDateTime, validateAuditSearch } from ".";

const environment = "01a0bae7-8000-7061-b218-6af9e14f4b21";
const from = "2026-09-19T00:00:00.123Z";
const to = "2026-09-20T00:00:00.987Z";

describe("hosted audit search", () => {
  it("retains bounded exact filters for URL-backed navigation", () => {
    expect(
      validateAuditSearch({
        environment,
        category: "security",
        actor: "credential",
        actorId: "credential-id",
        action: "project.credential.rotation_activated",
        from,
        to,
      }),
    ).toEqual({
      environment,
      category: "security",
      actor: "credential",
      actorId: "credential-id",
      action: "project.credential.rotation_activated",
      from,
      to,
    });
  });

  it("drops malformed, unpaired, and unknown URL filters", () => {
    expect(
      validateAuditSearch({
        environment: "not-an-id",
        category: "unknown",
        actor: "credential",
        actorId: 42,
        action: "INVALID ACTION",
        from: "not-a-date",
        to: {},
      }),
    ).toEqual({});
    expect(validateAuditSearch({ actor: "user", actorId: "" })).toEqual({});
  });

  it("preserves milliseconds and restores the safe initial window for an invalid range", () => {
    const initial = { from, to };
    expect(toLocalDateTime(to)).toMatch(/\.987$/u);
    expect(
      auditFiltersFromSearch(
        {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-03-01T00:00:00.000Z",
        },
        initial,
      ),
    ).toMatchObject({
      from: toLocalDateTime(from),
      to: toLocalDateTime(to),
      category: "all",
      actorKind: "all",
    });
  });
});
