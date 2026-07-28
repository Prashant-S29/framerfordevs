import { createContext } from "@framerfordevs/api/context";
import { appRouter } from "@framerfordevs/api/routers/index";
import { auth } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";

function logUnexpectedError(error: unknown) {
  if (error instanceof ORPCError && error.status < 500) return;
  console.error(error);
}

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError(logUnexpectedError)],
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [onError(logUnexpectedError)],
});

export function createApp(): Express {
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && origin !== env.CORS_ORIGIN) {
      res.sendStatus(403);
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
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.all("/api/auth{/*path}", toNodeHandler(auth));

  app.use(async (req, res, next) => {
    const context = await createContext({ req });
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

  app.get("/", (_req, res) => {
    res.status(200).send("OK");
  });

  return app;
}
