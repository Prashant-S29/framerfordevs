import { createContext } from "@framerfordevs/api/context";
import { EffectSchemaToJsonSchemaConverter } from "@framerfordevs/api/contracts/effect-schema-converter";
import { apiFailure } from "@framerfordevs/api/contracts/api-response";
import { readinessCheck, healthCheck } from "@framerfordevs/api/operations/system";
import { makeRequestContext } from "@framerfordevs/api/observability/request-context";
import { observeHttpRequest, reportBoundaryDefect } from "@framerfordevs/api/runtime";
import { appRouter } from "@framerfordevs/api/routers/index";
import { auth } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

const rpcHandler = new RPCHandler(appRouter);

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new EffectSchemaToJsonSchemaConverter(), new ZodToJsonSchemaConverter()],
    }),
  ],
});

function requestContext(req: Request) {
  return makeRequestContext({
    requestId: req.headers["x-request-id"],
    traceParent: req.headers.traceparent,
    method: req.method,
    path: req.path,
  });
}

export function createApp(): Express {
  const app = express();

  app.use((req, res, next) => {
    const context = requestContext(req);
    const startedAt = performance.now();

    req.headers["x-request-id"] = context.requestId;
    res.setHeader("x-request-id", context.requestId);
    res.once("finish", () => {
      const durationMs = Math.max(0, performance.now() - startedAt);
      void observeHttpRequest(context, res.statusCode, durationMs).catch(() => undefined);
    });

    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && origin !== env.CORS_ORIGIN) {
      const failure = apiFailure({
        code: "FORBIDDEN",
        message: "The request origin is not allowed.",
        requestId: requestContext(req).requestId,
        retryable: false,
      });
      res.status(403).json(failure);
      return;
    }

    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, origin === env.CORS_ORIGIN);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Traceparent", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      credentials: true,
    }),
  );

  app.all("/api/auth{/*path}", toNodeHandler(auth));

  app.use(async (req, res, next) => {
    const context = createContext({ req });
    const rpcResult = await rpcHandler.handle(req, res, {
      prefix: "/rpc",
      context,
    });
    if (rpcResult.matched) return;

    const apiResult = await apiHandler.handle(req, res, {
      prefix: "/api-reference",
      context,
    });
    if (apiResult.matched) return;

    next();
  });

  app.use(express.json());

  app.get("/", async (req, res) => {
    const context = createContext({ req });
    const result = await context.execute("http.health", healthCheck(), "Service is healthy.");
    res.status(result.status).json(result.response);
  });

  app.get("/ready", async (req, res) => {
    const context = createContext({ req });
    const result = await context.execute("http.readiness", readinessCheck(), "Service is ready.");
    res.status(result.status).json(result.response);
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const context = requestContext(req);
    void reportBoundaryDefect(context, error).catch(() => undefined);
    res.status(500).json(
      apiFailure({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: context.requestId,
        retryable: false,
      }),
    );
  });

  return app;
}
