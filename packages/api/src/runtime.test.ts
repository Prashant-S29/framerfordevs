import { afterAll, assert, beforeEach, describe, expect, it } from "@effect/vitest";
import { Context, Effect, Layer, ManagedRuntime, TestClock } from "effect";

import { UnauthorizedFailure } from "./contracts/errors";
import { ApplicationLogger, type LogRecord, redactFields } from "./observability/logger";
import { RequestContext } from "./observability/request-context";
import { Telemetry, type HttpRequestMetric } from "./observability/telemetry";
import { readinessCheck, requireSession } from "./operations/system";
import { classifyCause, executeWithRuntime, recordHttpRequest } from "./runtime";
import { AuthSessionFailure } from "./contracts/errors";
import { AuthSessionService } from "./services/auth-session";
import { DatabaseFailure } from "./contracts/errors";
import { Database } from "./services/database";
import { PlatformRepositoryLive } from "./services/platform-repository";

const logRecords: Array<LogRecord> = [];
const requestMetrics: Array<HttpRequestMetric> = [];
const defectRoutes: Array<string> = [];

const LoggerTest = Layer.succeed(ApplicationLogger, {
  info: (message: string, fields = {}) =>
    Effect.sync(() => {
      logRecords.push({ level: "info", message, fields: redactFields(fields) });
    }),
  error: (message: string, fields = {}) =>
    Effect.sync(() => {
      logRecords.push({ level: "error", message, fields: redactFields(fields) });
    }),
});

const TelemetryTest = Layer.succeed(Telemetry, {
  recordHttpRequest: (event: HttpRequestMetric) =>
    Effect.sync(() => {
      requestMetrics.push(event);
    }),
  recordDefect: (routeFamily) =>
    Effect.sync(() => {
      defectRoutes.push(routeFamily);
    }),
});

const AuthSessionTest = Layer.succeed(AuthSessionService, {
  getSession: () => Effect.succeed(null),
});

const DatabaseTest = Layer.succeed(Database, {
  ping: Effect.void,
});

const TestLive = Layer.mergeAll(
  LoggerTest,
  TelemetryTest,
  AuthSessionTest,
  DatabaseTest,
  PlatformRepositoryLive,
);
const testRuntime = ManagedRuntime.make(TestLive);

const request = RequestContext.make({
  requestId: "request-runtime-1",
  method: "POST",
  routeFamily: "rpc",
  traceParent: null,
});

beforeEach(() => {
  logRecords.length = 0;
  requestMetrics.length = 0;
  defectRoutes.length = 0;
});

afterAll(async () => {
  await testRuntime.dispose();
});

describe("application runtime boundary", () => {
  it("returns the standard success envelope", async () => {
    const result = await executeWithRuntime(
      testRuntime,
      "test.success",
      request,
      Effect.succeed({ value: 1 }),
      "Succeeded.",
    );

    expect(result).toEqual({
      status: 200,
      response: {
        ok: true,
        data: { value: 1 },
        error: null,
        message: "Succeeded.",
      },
    });
    expect(logRecords.at(-1)?.fields.outcome).toBe("success");
  });

  it("maps expected typed failures without treating them as defects", async () => {
    const result = await executeWithRuntime(
      testRuntime,
      "test.failure",
      request,
      Effect.fail(UnauthorizedFailure.make()),
      "Unused.",
    );

    expect(result.status).toBe(401);
    expect(result.response.ok).toBe(false);
    expect(defectRoutes).toHaveLength(0);
    expect(logRecords.at(-1)?.fields).toMatchObject({
      outcome: "failure",
      errorTag: "UnauthorizedFailure",
    });
  });

  it("sanitizes unexpected defects and records a defect metric", async () => {
    const result = await executeWithRuntime(
      testRuntime,
      "test.defect",
      request,
      Effect.die(new Error("token=private password=private")),
      "Unused.",
    );
    const encodedLogs = JSON.stringify(logRecords);

    expect(result.status).toBe(500);
    expect(result.response).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR", requestId: request.requestId },
    });
    expect(defectRoutes).toEqual(["rpc"]);
    expect(encodedLogs).not.toContain("token=private");
    expect(encodedLogs).not.toContain("password=private");
  });

  it("distinguishes interruption from expected failure and defect", async () => {
    const result = await executeWithRuntime(
      testRuntime,
      "test.interrupted",
      request,
      Effect.interrupt,
      "Unused.",
    );

    expect(result.status).toBe(500);
    expect(defectRoutes).toHaveLength(0);
    expect(logRecords.at(-1)?.fields.outcome).toBe("interrupted");
  });

  it.effect("classifies typed failures, defects, and interruption independently", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.exit(Effect.fail(UnauthorizedFailure.make()));
      const defect = yield* Effect.exit(Effect.die("broken invariant"));
      const interrupted = yield* Effect.exit(Effect.interrupt);

      if (failure._tag === "Failure") {
        assert.strictEqual(classifyCause(failure.cause).kind, "failure");
      }
      if (defect._tag === "Failure") {
        assert.strictEqual(classifyCause(defect.cause).kind, "defect");
      }
      if (interrupted._tag === "Failure") {
        assert.strictEqual(classifyCause(interrupted.cause).kind, "interrupted");
      }
    }),
  );

  it.effect("uses the replaceable Effect test clock", () =>
    Effect.gen(function* () {
      const before = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      yield* TestClock.adjust("25 millis");
      const after = yield* Effect.clockWith((clock) => clock.currentTimeMillis);

      assert.strictEqual(after - before, 25);
    }),
  );

  it("records bounded request metrics through a replaceable telemetry layer", async () => {
    await testRuntime.runPromise(recordHttpRequest(request, 204, 12.5));

    expect(requestMetrics).toEqual([
      {
        method: "POST",
        routeFamily: "rpc",
        statusFamily: "2xx",
        durationMs: 12.5,
      },
    ]);
  });
});

describe("replaceable infrastructure services", () => {
  it("translates database rejection through a test Database layer", async () => {
    const DatabaseRejected = Layer.succeed(Database, {
      ping: Effect.fail(
        DatabaseFailure.make({ operation: "database.ping", cause: new Error("offline") }),
      ),
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        LoggerTest,
        TelemetryTest,
        AuthSessionTest,
        DatabaseRejected,
        PlatformRepositoryLive,
      ),
    );

    const result = await executeWithRuntime(
      runtime,
      "test.readiness",
      request,
      readinessCheck(),
      "Ready.",
    );
    await runtime.dispose();

    expect(result.status).toBe(503);
    expect(result.response).toMatchObject({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", retryable: true },
    });
  });

  it("translates Better Auth session rejection through a test auth layer", async () => {
    const AuthRejected = Layer.succeed(AuthSessionService, {
      getSession: () =>
        Effect.fail(
          AuthSessionFailure.make({ operation: "auth.session.get", cause: new Error("offline") }),
        ),
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(LoggerTest, TelemetryTest, AuthRejected, DatabaseTest, PlatformRepositoryLive),
    );

    const result = await executeWithRuntime(
      runtime,
      "test.auth",
      request,
      requireSession(new Headers()),
      "Session loaded.",
    );
    await runtime.dispose();

    expect(result.status).toBe(503);
    expect(result.response).toMatchObject({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", retryable: true },
    });
  });
});

describe("ManagedRuntime lifecycle", () => {
  it("initializes a shared resource once and releases it on shutdown", async () => {
    let initialized = 0;
    let released = 0;

    class LifecycleResource extends Context.Tag("LifecycleResource")<
      LifecycleResource,
      { readonly ready: true }
    >() {}

    const LifecycleLive = Layer.scoped(
      LifecycleResource,
      Effect.acquireRelease(
        Effect.sync(() => {
          initialized += 1;
          return { ready: true };
        }),
        () =>
          Effect.sync(() => {
            released += 1;
          }),
      ),
    );
    const runtime = ManagedRuntime.make(LifecycleLive);

    await runtime.runPromise(LifecycleResource);
    await runtime.runPromise(LifecycleResource);
    expect(initialized).toBe(1);
    expect(released).toBe(0);

    await runtime.dispose();
    expect(released).toBe(1);
  });
});
