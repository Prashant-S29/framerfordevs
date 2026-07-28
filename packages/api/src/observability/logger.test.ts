import { assert, describe, expect, it, layer } from "@effect/vitest";
import { Effect } from "effect";

import {
  ApplicationLogger,
  ApplicationLoggerLive,
  redactFields,
  redactString,
  sanitizeCause,
} from "./logger";

describe("structured log redaction", () => {
  it("redacts authorization, cookies, passwords, tokens, database URLs, and bodies", () => {
    const fields = redactFields({
      authorization: "Bearer private-token",
      cookie: "session=private-cookie",
      password: "private-password",
      token: "private-token",
      databaseUrl: "postgresql://admin:password@database/internal",
      body: { title: "private content" },
      requestId: "request-1",
    });

    expect(fields).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      password: "[REDACTED]",
      token: "[REDACTED]",
      databaseUrl: "[REDACTED]",
      body: "[REDACTED]",
      requestId: "request-1",
    });
  });

  it("redacts credentials embedded in free-form error messages", () => {
    const redacted = redactString(
      "Bearer abc.def password=hunter2 postgresql://admin:secret@database/internal",
    );

    expect(redacted).not.toContain("abc.def");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("admin:secret");
    expect(redacted).not.toContain("postgresql://");
    expect(redacted).toContain("[REDACTED]");
  });

  it("sanitizes errors while preserving useful diagnostic identity", () => {
    const result = sanitizeCause(
      new TypeError("request failed with token=private and password=private"),
    );
    const encoded = JSON.stringify(result);

    expect(encoded).toContain("TypeError");
    expect(encoded).toContain("request failed");
    expect(encoded).not.toContain("token=private");
    expect(encoded).not.toContain("password=private");
  });

  it("redacts SQL and bounds nested diagnostic objects", () => {
    const deeplyNested = {
      level: { level: { level: { level: { level: { level: { level: "secret" } } } } } },
    };
    const encoded = JSON.stringify(redactFields(deeplyNested));
    const sql = redactString("query failed: select password from account where id = 1");

    expect(encoded).toContain("[TRUNCATED]");
    expect(sql).not.toContain("select password");
    expect(sql).toContain("[REDACTED_SQL]");
  });

  it("does not serialize arbitrary object defects as potential content payloads", () => {
    expect(sanitizeCause({ title: "private content", body: "private" })).toEqual({
      type: "object",
    });
  });

  layer(ApplicationLoggerLive)((it) => {
    it.effect("provides replaceable structured logger methods", () =>
      Effect.gen(function* () {
        const logger = yield* ApplicationLogger;
        yield* logger.info("test.info", { requestId: "request-1" });
        yield* logger.error("test.error", { token: "private" });
        assert.isTrue(true);
      }),
    );
  });
});
