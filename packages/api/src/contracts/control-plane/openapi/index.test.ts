import { assert, describe, it } from "@effect/vitest";

import { controlPlaneOpenApiDocument } from "./index";

const dataMethods = new Set(["get", "post", "put", "patch"]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("Control Plane OpenAPI", () => {
  it("publishes the exact bounded route and operation set", () => {
    assert.deepStrictEqual(Object.keys(controlPlaneOpenApiDocument.paths), [
      "/workspaces",
      "/workspaces/{workspaceId}",
      "/workspaces/{workspaceId}/projects",
      "/projects/{projectId}",
      "/projects/{projectId}/archive",
      "/projects/{projectId}/restore",
      "/projects/{projectId}/capabilities",
      "/projects/{projectId}/capabilities/cms",
      "/projects/{projectId}/environments/{environmentId}/studio-registration",
    ]);

    const operationIds = Object.values(controlPlaneOpenApiDocument.paths).flatMap((path) =>
      Object.entries(path)
        .filter(([method]) => dataMethods.has(method))
        .map(([, operation]) => operation.operationId),
    );
    assert.strictEqual(operationIds.length, 13);
    assert.strictEqual(new Set(operationIds).size, operationIds.length);
  });

  it("keeps every data operation bearer-authenticated, no-store, and preflight-closed", () => {
    for (const path of Object.values(controlPlaneOpenApiDocument.paths)) {
      assert.property(path, "options");
      assert.deepStrictEqual(path.options.security, []);
      assert.property(path.options.responses, "403");

      for (const [method, operation] of Object.entries(path)) {
        if (!dataMethods.has(method)) continue;
        assert.isAbove(operation.security.length, 0);
        assert.property(operation.responses, "200");
        assert.strictEqual(operation.responses["200"]["x-cache-policy"], "no-store");
        for (const response of Object.values(operation.responses)) {
          assert.isTrue(isRecord(response));
          const headers = isRecord(response) ? Reflect.get(response, "headers") : undefined;
          assert.isTrue(isRecord(headers));
          if (isRecord(headers)) {
            assert.property(headers, "Cache-Control");
            assert.property(headers, "X-Request-Id");
            assert.property(headers, "RateLimit-Limit");
            assert.property(headers, "RateLimit-Remaining");
            assert.property(headers, "RateLimit-Reset");
            assert.property(headers, "Retry-After");
          }
        }
      }
    }
  });

  it("restricts account enumeration and lifecycle to OAuth user authority", () => {
    const workspaceSecurity = controlPlaneOpenApiDocument.paths["/workspaces"].get.security;
    const projectListSecurity =
      controlPlaneOpenApiDocument.paths["/workspaces/{workspaceId}/projects"].get.security;
    const archiveSecurity =
      controlPlaneOpenApiDocument.paths["/projects/{projectId}/archive"].post.security;
    const exactProjectSecurity =
      controlPlaneOpenApiDocument.paths["/projects/{projectId}"].get.security;

    assert.deepStrictEqual(workspaceSecurity, [{ ControlPlaneOAuthRead: [] }]);
    assert.deepStrictEqual(projectListSecurity, [{ ControlPlaneOAuthRead: [] }]);
    assert.deepStrictEqual(archiveSecurity, [{ ControlPlaneOAuthLifecycle: [] }]);
    assert.deepStrictEqual(exactProjectSecurity, [
      { ControlPlaneOAuthRead: [] },
      { ControlPlaneManagementCredential: [] },
    ]);
  });

  it("contains closed schemas without dashboard, cookie, SDK, or secret administration surfaces", () => {
    const serialized = JSON.stringify(controlPlaneOpenApiDocument);

    assert.notInclude(serialized, "#/$defs/");
    assert.notInclude(serialized, "cookie");
    assert.notInclude(serialized, "clientSecret");
    assert.notInclude(serialized, "credential.issue");
    assert.notInclude(serialized, "webhook.manage");
    assert.notInclude(serialized, "/members");
    assert.notInclude(serialized, "/invitations");
    assert.strictEqual(controlPlaneOpenApiDocument["x-sdk-supported"], false);
    assert.strictEqual(controlPlaneOpenApiDocument["x-control-plane-limits"].maximumPageSize, 50);
    assert.strictEqual(controlPlaneOpenApiDocument["x-control-plane-limits"].requestBytes, 65_536);
  });
});
