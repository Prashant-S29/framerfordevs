// Verifies dashboard control operations use canonical session paths while editorial calls stay on oRPC.

import { describe, expect, it } from "vitest";

import {
  adaptControlPlaneResponse,
  planControlPlaneRequest,
  readControlPlaneResponse,
} from "./index";

const scope = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
} as const;

describe("dashboard Control Plane transport", () => {
  const resourceId = "019fae8b-1234-7000-8000-000000000003";
  const project = `/projects/${scope.projectId}`;
  const environment = `${project}/environments/${scope.environmentId}`;
  const commonInput = {
    ...scope,
    workspaceId: resourceId,
    membershipId: resourceId,
    invitationId: resourceId,
    localeId: resourceId,
    credentialId: resourceId,
    rotationId: resourceId,
    endpointId: resourceId,
    mappingId: resourceId,
    deliveryId: resourceId,
    version: 1,
    expectedVersion: 1,
  };

  it.each([
    [
      ["platform", "projects", "invitations", "accept"],
      { token: "proof" },
      "POST",
      "/invitations/accept",
    ],
    [
      ["platform", "projects", "invitations", "inspect"],
      { token: "proof" },
      "POST",
      "/invitations/inspect",
    ],
    [
      ["platform", "workspaces", "list"],
      { cursor: "next", limit: 20 },
      "GET",
      "/workspaces?cursor=next&limit=20",
    ],
    [["platform", "workspaces", "create"], { name: "Workspace" }, "POST", "/workspaces"],
    [["platform", "projects", "list"], commonInput, "GET", `/workspaces/${resourceId}/projects`],
    [["platform", "projects", "create"], commonInput, "POST", `/workspaces/${resourceId}/projects`],
    [["platform", "projects", "get"], commonInput, "GET", project],
    [["platform", "projects", "update"], commonInput, "PATCH", project],
    [["platform", "projects", "archive"], commonInput, "POST", `${project}/archive`],
    [["platform", "projects", "restore"], commonInput, "POST", `${project}/restore`],
    [
      ["platform", "projects", "enableCapability"],
      commonInput,
      "PUT",
      `${project}/capabilities/cms`,
    ],
    [["platform", "projects", "access"], commonInput, "GET", `${project}/governance`],
    [["platform", "projects", "members", "list"], commonInput, "GET", `${project}/members`],
    [
      ["platform", "projects", "members", "updatePolicy"],
      commonInput,
      "PUT",
      `${project}/members/${resourceId}/policy`,
    ],
    [
      ["platform", "projects", "members", "remove"],
      commonInput,
      "POST",
      `${project}/members/${resourceId}/remove`,
    ],
    [["platform", "projects", "invitations", "list"], commonInput, "GET", `${project}/invitations`],
    [
      ["platform", "projects", "invitations", "create"],
      commonInput,
      "POST",
      `${project}/invitations`,
    ],
    [
      ["platform", "projects", "invitations", "revoke"],
      commonInput,
      "POST",
      `${project}/invitations/${resourceId}/revoke`,
    ],
    [["platform", "projects", "locales", "list"], commonInput, "GET", `${project}/locales`],
    [["platform", "projects", "locales", "create"], commonInput, "POST", `${project}/locales`],
    [
      ["platform", "projects", "locales", "updateDisplayName"],
      commonInput,
      "PATCH",
      `${project}/locales/${resourceId}`,
    ],
    [
      ["platform", "projects", "locales", "reorder"],
      commonInput,
      "PUT",
      `${project}/locales/order`,
    ],
    [
      ["platform", "projects", "locales", "updateStatus"],
      commonInput,
      "PUT",
      `${project}/locales/${resourceId}/status`,
    ],
    [
      ["platform", "projects", "studioRegistration", "get"],
      commonInput,
      "GET",
      `${environment}/studio-registration`,
    ],
    [
      ["platform", "projects", "studioRegistration", "put"],
      commonInput,
      "PUT",
      `${environment}/studio-registration`,
    ],
    [
      ["platform", "projects", "operations", "audit", "list"],
      { ...commonInput, query: {} },
      "GET",
      `${project}/audit-events`,
    ],
    [
      ["platform", "projects", "credentials", "operationalList"],
      { ...commonInput, query: {} },
      "GET",
      `${environment}/credentials`,
    ],
    [
      ["platform", "projects", "credentials", "list"],
      commonInput,
      "GET",
      `${environment}/credentials?family=all&status=all`,
    ],
    [
      ["platform", "projects", "credentials", "issue"],
      commonInput,
      "POST",
      `${environment}/credentials`,
    ],
    [
      ["platform", "projects", "credentials", "rotation", "start"],
      commonInput,
      "POST",
      `${environment}/credentials/${resourceId}/rotations`,
    ],
    [
      ["platform", "projects", "credentials", "rotation", "change"],
      { ...commonInput, action: "activate" },
      "POST",
      `${environment}/credential-rotations/${resourceId}/activate`,
    ],
    [
      ["platform", "projects", "credentials", "rotation", "change"],
      { ...commonInput, action: "cancel" },
      "POST",
      `${environment}/credential-rotations/${resourceId}/cancel`,
    ],
    [
      ["platform", "projects", "credentials", "rotation", "change"],
      { ...commonInput, action: "complete" },
      "POST",
      `${environment}/credential-rotations/${resourceId}/complete`,
    ],
    [
      ["platform", "projects", "credentials", "revoke"],
      commonInput,
      "POST",
      `${environment}/credentials/${resourceId}/revoke`,
    ],
    [["webhooks", "endpoints", "list"], commonInput, "GET", `${environment}/webhooks`],
    [["webhooks", "endpoints", "create"], commonInput, "POST", `${environment}/webhooks`],
    [
      ["webhooks", "endpoints", "update"],
      commonInput,
      "PATCH",
      `${environment}/webhooks/${resourceId}`,
    ],
    [
      ["webhooks", "endpoints", "setState"],
      commonInput,
      "PUT",
      `${environment}/webhooks/${resourceId}/state`,
    ],
    [
      ["webhooks", "endpoints", "replaceSubscriptions"],
      commonInput,
      "PUT",
      `${environment}/webhooks/${resourceId}/subscriptions`,
    ],
    [
      ["webhooks", "endpoints", "startRotation"],
      commonInput,
      "POST",
      `${environment}/webhooks/${resourceId}/secret-rotations`,
    ],
    [
      ["webhooks", "endpoints", "changeRotation"],
      { ...commonInput, action: "activate" },
      "POST",
      `${environment}/webhooks/${resourceId}/secret-rotations/activate`,
    ],
    [
      ["webhooks", "endpoints", "changeRotation"],
      { ...commonInput, action: "cancel" },
      "POST",
      `${environment}/webhooks/${resourceId}/secret-rotations/cancel`,
    ],
    [
      ["webhooks", "endpoints", "changeRotation"],
      { ...commonInput, action: "complete" },
      "POST",
      `${environment}/webhooks/${resourceId}/secret-rotations/complete`,
    ],
    [["webhooks", "mappings", "list"], commonInput, "GET", `${environment}/invalidation-mappings`],
    [
      ["webhooks", "mappings", "create"],
      commonInput,
      "POST",
      `${environment}/invalidation-mappings`,
    ],
    [
      ["webhooks", "mappings", "update"],
      commonInput,
      "PUT",
      `${environment}/invalidation-mappings/${resourceId}`,
    ],
    [
      ["webhooks", "mappings", "setState"],
      commonInput,
      "PUT",
      `${environment}/invalidation-mappings/${resourceId}/state`,
    ],
    [
      ["webhooks", "deliveries", "operationalList"],
      { ...commonInput, query: {} },
      "GET",
      `${environment}/webhook-deliveries`,
    ],
    [
      ["webhooks", "deliveries", "detail"],
      commonInput,
      "GET",
      `${environment}/webhook-deliveries/${resourceId}`,
    ],
    [
      ["webhooks", "attempts", "operationalList"],
      commonInput,
      "GET",
      `${environment}/webhook-deliveries/${resourceId}/attempts`,
    ],
    [["webhooks", "deliveries", "replay"], commonInput, "POST", `${environment}/webhook-replays`],
  ] as const)("maps %j to %s %s", (procedure, input, method, suffix) => {
    expect(planControlPlaneRequest(procedure, input)).toMatchObject({
      method,
      path: `/api/control-plane/v1${suffix}`,
    });
  });

  it("adds receipt authority and adapts project DTOs without changing the route contract", () => {
    const workspace = planControlPlaneRequest(["platform", "workspaces", "create"], {
      name: "Workspace",
    });
    const project = planControlPlaneRequest(["platform", "projects", "get"], {
      projectId: scope.projectId,
    });

    expect(workspace?.method).toBe("POST");
    expect(workspace?.body?.["commandId"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(
      project?.transformData?.({
        id: scope.projectId,
        primaryEnvironment: { id: scope.environmentId },
      }),
    ).toMatchObject({ environment: { id: scope.environmentId } });
  });

  it("maps canonical mutation authority fields without forwarding unrelated input", () => {
    const workspace = planControlPlaneRequest(["platform", "workspaces", "create"], {
      name: "Workspace",
      ignored: "not-forwarded",
    });
    const projectUpdate = planControlPlaneRequest(["platform", "projects", "update"], {
      projectId: scope.projectId,
      version: 7,
      name: "Renamed",
      description: null,
      ignored: "not-forwarded",
    });
    const localeOrder = planControlPlaneRequest(["platform", "projects", "locales", "reorder"], {
      projectId: scope.projectId,
      locales: [{ localeId: resourceId, version: 3, ignored: true }],
    });
    const credentialChange = planControlPlaneRequest(
      ["platform", "projects", "credentials", "rotation", "change"],
      { ...commonInput, action: "complete", authorityAcknowledged: false },
    );
    const endpointDisable = planControlPlaneRequest(["webhooks", "endpoints", "setState"], {
      ...commonInput,
      state: "disabled",
    });
    const replay = planControlPlaneRequest(["webhooks", "deliveries", "replay"], {
      ...commonInput,
      commandId: resourceId,
      sourceDeliveryId: resourceId,
      ignored: "not-forwarded",
    });

    expect(workspace?.body).toEqual({
      commandId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      name: "Workspace",
    });
    expect(projectUpdate?.body).toEqual({
      expectedVersion: 7,
      name: "Renamed",
      description: null,
    });
    expect(localeOrder?.body).toEqual({ locales: [{ localeId: resourceId, expectedVersion: 3 }] });
    expect(credentialChange?.body).toEqual({ expectedVersion: 1, authorityAcknowledged: true });
    expect(endpointDisable?.body).toEqual({
      expectedVersion: 1,
      state: "disabled",
      authorityAcknowledged: true,
    });
    expect(replay?.body).toEqual({
      commandId: resourceId,
      endpointId: resourceId,
      sourceDeliveryId: resourceId,
      authorityAcknowledged: true,
    });
  });

  it("encodes path segments and omits absent query values", () => {
    const unsafeId = "../resource?admin=true#fragment";
    const member = planControlPlaneRequest(["platform", "projects", "members", "updatePolicy"], {
      projectId: unsafeId,
      membershipId: unsafeId,
      version: 1,
    });
    const list = planControlPlaneRequest(["platform", "projects", "members", "list"], {
      projectId: scope.projectId,
      role: undefined,
      search: "name & role",
      cursor: null,
      limit: 25,
    });

    expect(member?.path).toBe(
      "/api/control-plane/v1/projects/..%2Fresource%3Fadmin%3Dtrue%23fragment/members/..%2Fresource%3Fadmin%3Dtrue%23fragment/policy",
    );
    expect(list?.path).toBe(
      `/api/control-plane/v1/projects/${scope.projectId}/members?search=name+%26+role&limit=25`,
    );
  });

  it("keeps editorial collection and entry procedures on temporary oRPC", () => {
    expect(
      planControlPlaneRequest(["platform", "projects", "collections", "list"], {
        projectId: scope.projectId,
      }),
    ).toBeNull();
    expect(planControlPlaneRequest(["healthCheck"], undefined)).toBeNull();
  });

  it("adapts success and failure envelopes to the typed query transport", async () => {
    const success = new Response(
      JSON.stringify({ ok: true, data: { items: [] }, message: "Loaded." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const successBody = await readControlPlaneResponse(success.clone());
    expect(await adaptControlPlaneResponse(success, successBody).json()).toEqual({
      json: { ok: true, data: { items: [] }, message: "Loaded." },
    });

    const failure = new Response(
      JSON.stringify({
        ok: false,
        data: null,
        error: { code: "FORBIDDEN", requestId: "request-1", retryable: false },
        message: "Not allowed.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
    const failureBody = await readControlPlaneResponse(failure.clone());
    expect(await adaptControlPlaneResponse(failure, failureBody).json()).toMatchObject({
      json: { defined: true, code: "FORBIDDEN", status: 403, message: "Not allowed." },
    });
  });

  it("rejects malformed, missing, declared-oversized, and streamed-oversized responses", async () => {
    await expect(readControlPlaneResponse(new Response("not-json"))).rejects.toThrow();
    await expect(readControlPlaneResponse(new Response(null))).rejects.toThrow("missing");

    const declared = new Response("{}", { headers: { "Content-Length": "524289" } });
    await expect(readControlPlaneResponse(declared)).rejects.toThrow("fixed bound");

    const streamed = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(512 * 1_024));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      }),
    );
    await expect(readControlPlaneResponse(streamed)).rejects.toThrow("fixed bound");
  });
});
