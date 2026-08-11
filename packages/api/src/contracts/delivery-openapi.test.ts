import { describe, expect, it } from "vitest";

import { deliveryOpenApiDocument } from "./delivery-openapi";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("Expected an OpenAPI object.");
  return value;
}

function array(value: unknown): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) throw new Error("Expected an OpenAPI array.");
  return value;
}

const paths = record(deliveryOpenApiDocument.paths);
const components = record(deliveryOpenApiDocument.components);
const schemas = record(components.schemas);

function operation(path: string, method: "get" | "head" | "options") {
  return record(record(paths[path])[method]);
}

function parameterNames(operationValue: Readonly<Record<string, unknown>>) {
  return array(operationValue.parameters).map((parameter) => String(record(parameter).name));
}

function response(operationValue: Readonly<Record<string, unknown>>, status: string) {
  return record(record(operationValue.responses)[status]);
}

describe("Delivery OpenAPI", () => {
  it("locks the complete public path, method, and response surface", () => {
    const summary = Object.fromEntries(
      Object.entries(paths)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, pathItem]) => {
          const methods = record(pathItem);
          return [
            path,
            Object.fromEntries(
              ["get", "head", "options"].map((method) => [
                method,
                Object.keys(record(record(methods[method]).responses)).sort(),
              ]),
            ),
          ];
        }),
    );

    expect(summary).toMatchInlineSnapshot(`
      {
        "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries": {
          "get": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "409",
            "413",
            "429",
            "500",
            "503",
          ],
          "head": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "409",
            "413",
            "429",
            "500",
            "503",
          ],
          "options": [
            "204",
            "403",
          ],
        },
        "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/by/{fieldKey}": {
          "get": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "head": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "options": [
            "204",
            "403",
          ],
        },
        "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}": {
          "get": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "head": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "options": [
            "204",
            "403",
          ],
        },
        "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/publications/{publicationId}": {
          "get": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "head": [
            "200",
            "304",
            "400",
            "401",
            "404",
            "413",
            "429",
            "500",
            "503",
          ],
          "options": [
            "204",
            "403",
          ],
        },
      }
    `);
  });

  it("requires exact locale and operation-specific public authority", () => {
    for (const path of Object.keys(paths)) {
      for (const method of ["get", "head"] as const) {
        const names = parameterNames(operation(path, method));
        expect(names).toContain("projectId");
        expect(names).toContain("environmentKey");
        expect(names).toContain("collectionKey");
        expect(names).toContain("locale");
      }
    }

    const uniquePath = Object.keys(paths).find((path) => path.includes("by/{fieldKey}"));
    expect(uniquePath).toBeDefined();
    expect(parameterNames(operation(uniquePath ?? "", "get"))).toEqual(
      expect.arrayContaining(["fieldKey", "value"]),
    );
    const immutablePath = Object.keys(paths).find((path) => path.includes("publications"));
    expect(parameterNames(operation(immutablePath ?? "", "get"))).toContain("publicationId");
  });

  it("documents validators, bounded quotas, errors, and schema-backed envelopes", () => {
    const listPath = Object.keys(paths).find((path) => path.endsWith("/entries")) ?? "";
    const list = operation(listPath, "get");
    const successHeaders = record(response(list, "200").headers);
    const notModifiedHeaders = record(response(list, "304").headers);
    const limitedHeaders = record(response(list, "429").headers);

    for (const header of [
      "ETag",
      "Last-Modified",
      "Cache-Control",
      "X-Request-Id",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ]) {
      expect(successHeaders).toHaveProperty(header);
      expect(notModifiedHeaders).toHaveProperty(header);
    }
    expect(limitedHeaders).toHaveProperty("Retry-After");
    expect(schemas).toHaveProperty("DeliveryItemResponse");
    expect(schemas).toHaveProperty("DeliveryPageResponse");
    expect(schemas).toHaveProperty("DeliveryApiFailure");
    expect(JSON.stringify(schemas)).toContain("DELIVERY_CURSOR_STALE");
    expect(JSON.stringify(schemas)).not.toContain("PROJECT_KEY_CONFLICT");
  });

  it("contains only tenant-neutral public Delivery documentation", () => {
    const serialized = JSON.stringify(deliveryOpenApiDocument);
    expect(serialized).not.toContain("/rpc");
    expect(serialized).not.toContain("api-reference");
    expect(serialized).not.toContain("workspace");
    expect(serialized).not.toContain("saveDraft");
    expect(serialized).not.toContain("ffd_del_019");

    const operationIds = Object.values(paths).flatMap((pathItem) =>
      Object.values(record(pathItem)).flatMap((method) => {
        const id = Reflect.get(record(method), "operationId");
        return typeof id === "string" ? [id] : [];
      }),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });
});
