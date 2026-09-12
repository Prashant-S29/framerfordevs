import { request as requestHttp } from "node:http";

import { controlPlaneLimits } from "@framerfordevs/api/contracts/control-plane/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import { generatePublicArtifacts } from "@framerfordevs/public-contracts";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { classifyControlPlaneRequest, createApp } from "../../../src/app";

const app = createApp();
const artifact = generatePublicArtifacts().find(
  (candidate) => candidate.key === "control-plane/v1",
);
if (artifact === undefined) throw new Error("Missing Control Plane public artifact.");

afterAll(async () => {
  await disposeApplicationRuntime();
});

function duplicateAuthorizationRequest(): Promise<{
  readonly status: number;
  readonly headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  readonly body: string;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Control Plane test server did not bind."));
        return;
      }
      const outbound = requestHttp(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/control-plane/v1/workspaces",
          method: "GET",
          headers: { Authorization: ["Bearer first", "Bearer second"] },
        },
        (incoming) => {
          const chunks: Array<Buffer> = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({
                status: incoming.statusCode ?? 0,
                headers: incoming.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          });
        },
      );
      outbound.on("error", (error) => {
        server.close(() => reject(error));
      });
      outbound.end();
    });
  });
}

describe("Control Plane HTTP boundary", () => {
  it("classifies only closed operation and cost labels", () => {
    expect(classifyControlPlaneRequest("GET", "/workspaces")).toEqual({
      operation: "workspace_list",
      costBucket: "1",
    });
    expect(
      classifyControlPlaneRequest(
        "PUT",
        "/projects/project-id/environments/environment-id/studio-registration",
      ),
    ).toEqual({ operation: "studio_registration_put", costBucket: "5" });
    expect(classifyControlPlaneRequest("DELETE", "/projects/project-id")).toBeNull();
  });

  it("serves the canonical artifact separately from bearer data routes", async () => {
    const response = await request(app).get("/api/control-plane/v1/openapi.json");

    expect(response.status).toBe(200);
    expect(response.text).toBe(artifact.bytes);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("requires bearer authority and ignores dashboard cookies", async () => {
    const response = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Cookie", "session=must-not-authenticate");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.headers["www-authenticate"]).toBe('Bearer realm="control-plane"');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["ratelimit-limit"]).toBe("3000");
    expect(response.headers.location).toBeUndefined();
  });

  it("rejects browser origins, preflight, and duplicate authorization", async () => {
    const origin = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Origin", "https://hostile.example");
    expect(origin.status).toBe(403);
    expect(origin.body.error.code).toBe("FORBIDDEN");
    expect(origin.headers["access-control-allow-origin"]).toBeUndefined();

    const preflight = await request(app)
      .options("/api/control-plane/v1/workspaces")
      .set("Origin", "https://hostile.example")
      .set("Access-Control-Request-Method", "GET");
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();

    const duplicate = await duplicateAuthorizationRequest();
    expect(duplicate.status).toBe(400);
    expect(JSON.parse(duplicate.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("closes methods, mutation queries, content types, and GET bodies", async () => {
    const method = await request(app).delete("/api/control-plane/v1/workspaces");
    expect(method.status).toBe(405);
    expect(method.headers.allow).toBe("GET, POST");

    const wrongMethod = await request(app).post(
      "/api/control-plane/v1/workspaces/019fae8b-1234-7000-8000-000000000001",
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe("GET");

    const unknown = await request(app).post("/api/control-plane/v1/unknown");
    expect(unknown.status).toBe(404);

    const query = await request(app)
      .post("/api/control-plane/v1/workspaces?token=forbidden")
      .set("Content-Type", "application/json")
      .send({ commandId: "019fae8b-1234-7000-8000-000000000001", name: "Workspace" });
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_ERROR");

    const contentType = await request(app)
      .post("/api/control-plane/v1/workspaces")
      .set("Content-Type", "text/plain")
      .send("{}");
    expect(contentType.status).toBe(400);
    expect(contentType.body.error.code).toBe("VALIDATION_ERROR");

    const getBody = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Content-Type", "application/json")
      .send({ unexpected: true });
    expect(getBody.status).toBe(400);
    expect(getBody.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects oversized requests before JSON decoding", async () => {
    const response = await request(app)
      .post("/api/control-plane/v1/workspaces")
      .set("Content-Type", "application/json")
      .set("Content-Length", String(controlPlaneLimits.requestBytes + 1))
      .send("{}");

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("CONTROL_PLANE_REQUEST_TOO_LARGE");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
