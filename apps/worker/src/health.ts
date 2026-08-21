// Exposes dependency-free liveness and fail-closed readiness without outbound DNS or HTTP.

import { createServer } from "node:http";

export interface WorkerHealthChecks {
  readonly liveness: () => Promise<{ readonly status: "ok" }>;
  readonly readiness: () => Promise<{ readonly status: "ready" }>;
}

export function createWorkerHealthServer(checks: WorkerHealthChecks) {
  return createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    if (request.method !== "GET") {
      response.writeHead(405).end(JSON.stringify({ status: "method_not_allowed" }));
      return;
    }
    if (request.url === "/health") {
      void checks.liveness().then((result) => {
        response.writeHead(200).end(JSON.stringify(result));
      });
      return;
    }
    if (request.url === "/ready") {
      void checks
        .readiness()
        .then((result) => {
          response.writeHead(200).end(JSON.stringify(result));
        })
        .catch(() => {
          response.writeHead(503).end(JSON.stringify({ status: "unavailable" }));
        });
      return;
    }
    response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
  });
}
