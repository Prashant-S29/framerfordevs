// Routes dashboard governance and operations calls to canonical same-origin Control Plane v1 paths.

type HttpMethod = "GET" | "PATCH" | "POST" | "PUT";

export interface ControlPlaneRequestPlan {
  readonly body: Readonly<Record<string, unknown>> | null;
  readonly method: HttpMethod;
  readonly path: string;
  readonly transformData?: (data: unknown) => unknown;
}

const prefix = "/api/control-plane/v1";
const maximumResponseBytes = 512 * 1_024;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("Control Plane input must be an object.");
  return value;
}

function stringField(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Control Plane input is missing ${key}.`);
  }
  return value;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function selected(
  input: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(keys.flatMap((key) => (key in input ? [[key, input[key]]] : [])));
}

function queryPath(
  path: string,
  input: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): string {
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? path : `${path}?${encoded}`;
}

function scopedPath(input: Readonly<Record<string, unknown>>, resource: string): string {
  return `${prefix}/projects/${segment(stringField(input, "projectId"))}/environments/${segment(stringField(input, "environmentId"))}/${resource}`;
}

function projectData(data: unknown): unknown {
  const value = record(data);
  return { ...value, environment: value["primaryEnvironment"] };
}

function wrappedData(key: string, transform?: (data: unknown) => unknown) {
  return (data: unknown): unknown => {
    const value = record(data)[key];
    return transform === undefined ? value : transform(value);
  };
}

function platformPlan(procedure: string, input: Readonly<Record<string, unknown>>) {
  if (procedure === "platform.workspaces.list") {
    return {
      method: "GET",
      path: queryPath(`${prefix}/workspaces`, input, ["cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "platform.workspaces.create") {
    return {
      method: "POST",
      path: `${prefix}/workspaces`,
      body: { commandId: crypto.randomUUID(), ...selected(input, ["name"]) },
      transformData: wrappedData("workspace"),
    } as const;
  }
  if (procedure === "platform.projects.list") {
    const workspaceId = segment(stringField(input, "workspaceId"));
    return {
      method: "GET",
      path: queryPath(`${prefix}/workspaces/${workspaceId}/projects`, input, [
        "status",
        "cursor",
        "limit",
      ]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.create") {
    const workspaceId = segment(stringField(input, "workspaceId"));
    return {
      method: "POST",
      path: `${prefix}/workspaces/${workspaceId}/projects`,
      body: {
        commandId: crypto.randomUUID(),
        ...selected(input, ["name", "key", "description", "initialCapabilities"]),
      },
      transformData: wrappedData("project", projectData),
    } as const;
  }

  const projectId = "projectId" in input ? segment(stringField(input, "projectId")) : null;
  if (projectId === null) return null;
  const projectPath = `${prefix}/projects/${projectId}`;
  if (procedure === "platform.projects.get") {
    return { method: "GET", path: projectPath, body: null, transformData: projectData } as const;
  }
  if (procedure === "platform.projects.update") {
    return {
      method: "PATCH",
      path: projectPath,
      body: {
        expectedVersion: input["version"],
        ...selected(input, ["name", "description"]),
      },
      transformData: projectData,
    } as const;
  }
  if (procedure === "platform.projects.archive" || procedure === "platform.projects.restore") {
    const action = procedure.endsWith("archive") ? "archive" : "restore";
    return {
      method: "POST",
      path: `${projectPath}/${action}`,
      body: { expectedVersion: input["version"] },
      transformData: projectData,
    } as const;
  }
  if (procedure === "platform.projects.enableCapability") {
    return {
      method: "PUT",
      path: `${projectPath}/capabilities/cms`,
      body: { commandId: crypto.randomUUID() },
      transformData: wrappedData("capability"),
    } as const;
  }
  if (procedure === "platform.projects.access") {
    return { method: "GET", path: `${projectPath}/governance`, body: null } as const;
  }
  if (procedure === "platform.projects.members.list") {
    return {
      method: "GET",
      path: queryPath(`${projectPath}/members`, input, ["role", "search", "cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.members.updatePolicy") {
    return {
      method: "PUT",
      path: `${projectPath}/members/${segment(stringField(input, "membershipId"))}/policy`,
      body: {
        expectedVersion: input["version"],
        ...selected(input, ["role", "localeAccess"]),
      },
    } as const;
  }
  if (procedure === "platform.projects.members.remove") {
    return {
      method: "POST",
      path: `${projectPath}/members/${segment(stringField(input, "membershipId"))}/remove`,
      body: { expectedVersion: input["version"] },
    } as const;
  }
  if (procedure === "platform.projects.invitations.list") {
    return {
      method: "GET",
      path: queryPath(`${projectPath}/invitations`, input, ["status", "search", "cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.invitations.create") {
    return {
      method: "POST",
      path: `${projectPath}/invitations`,
      body: selected(input, ["email", "role", "localeAccess"]),
    } as const;
  }
  if (procedure === "platform.projects.invitations.revoke") {
    return {
      method: "POST",
      path: `${projectPath}/invitations/${segment(stringField(input, "invitationId"))}/revoke`,
      body: { expectedVersion: input["version"] },
    } as const;
  }
  if (procedure === "platform.projects.locales.list") {
    return {
      method: "GET",
      path: queryPath(`${projectPath}/locales`, input, ["view", "includeRemoved"]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.locales.create") {
    return {
      method: "POST",
      path: `${projectPath}/locales`,
      body: {
        commandId: crypto.randomUUID(),
        ...selected(input, ["tag", "displayName"]),
      },
    } as const;
  }
  if (procedure === "platform.projects.locales.updateDisplayName") {
    return {
      method: "PATCH",
      path: `${projectPath}/locales/${segment(stringField(input, "localeId"))}`,
      body: { expectedVersion: input["version"], displayName: input["displayName"] },
    } as const;
  }
  if (procedure === "platform.projects.locales.reorder") {
    const locales = input["locales"];
    return {
      method: "PUT",
      path: `${projectPath}/locales/order`,
      body: {
        locales: Array.isArray(locales)
          ? locales.map((item) => {
              const locale = record(item);
              return {
                localeId: locale["localeId"],
                expectedVersion: locale["version"],
              };
            })
          : locales,
      },
    } as const;
  }
  if (procedure === "platform.projects.locales.updateStatus") {
    return {
      method: "PUT",
      path: `${projectPath}/locales/${segment(stringField(input, "localeId"))}/status`,
      body: {
        expectedVersion: input["version"],
        ...selected(input, ["status", "confirmDraftImpact"]),
      },
    } as const;
  }
  if (procedure === "platform.projects.studioRegistration.get") {
    return {
      method: "GET",
      path: `${scopedPath(input, "studio-registration")}`,
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.studioRegistration.put") {
    return {
      method: "PUT",
      path: `${scopedPath(input, "studio-registration")}`,
      body: selected(input, ["commandId", "expectedVersion", "applicationOrigin", "mountPath"]),
    } as const;
  }
  if (procedure === "platform.projects.operations.audit.list") {
    const auditQuery = record(input["query"]);
    return {
      method: "GET",
      path: queryPath(`${projectPath}/audit-events`, auditQuery, [
        "category",
        "actorKind",
        "from",
        "to",
        "cursor",
        "limit",
      ]),
      body: null,
    } as const;
  }
  return procedure.startsWith("platform.projects.credentials.")
    ? credentialPlan(procedure, input)
    : null;
}

function credentialPlan(procedure: string, input: Readonly<Record<string, unknown>>) {
  const credentialsPath = scopedPath(input, "credentials");
  if (procedure === "platform.projects.credentials.operationalList") {
    const query = record(input["query"]);
    return {
      method: "GET",
      path: queryPath(credentialsPath, query, ["family", "status", "cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.credentials.list") {
    return {
      method: "GET",
      path: queryPath(credentialsPath, { ...input, family: "all", status: "all" }, [
        "family",
        "status",
        "cursor",
        "limit",
      ]),
      body: null,
    } as const;
  }
  if (procedure === "platform.projects.credentials.issue") {
    return {
      method: "POST",
      path: credentialsPath,
      body: selected(input, [
        "family",
        "name",
        "scopes",
        "expiresAt",
        "nonExpiringAcknowledged",
        "previewAuthorityAcknowledged",
      ]),
    } as const;
  }
  if (procedure === "platform.projects.credentials.rotation.start") {
    return {
      method: "POST",
      path: `${credentialsPath}/${segment(stringField(input, "credentialId"))}/rotations`,
      body: selected(input, ["expectedVersion", "expiresAt", "nonExpiringAcknowledged"]),
    } as const;
  }
  if (procedure === "platform.projects.credentials.rotation.change") {
    return {
      method: "POST",
      path: `${scopedPath(input, "credential-rotations")}/${segment(stringField(input, "rotationId"))}/${segment(stringField(input, "action"))}`,
      body: { expectedVersion: input["expectedVersion"], authorityAcknowledged: true },
    } as const;
  }
  if (procedure === "platform.projects.credentials.revoke") {
    return {
      method: "POST",
      path: `${credentialsPath}/${segment(stringField(input, "credentialId"))}/revoke`,
      body: { expectedVersion: input["expectedVersion"], authorityAcknowledged: true },
    } as const;
  }
  return null;
}

function webhookPlan(procedure: string, input: Readonly<Record<string, unknown>>) {
  const endpointsPath = scopedPath(input, "webhooks");
  const mappingsPath = scopedPath(input, "invalidation-mappings");
  const deliveriesPath = scopedPath(input, "webhook-deliveries");
  if (procedure === "webhooks.endpoints.list") {
    return {
      method: "GET",
      path: queryPath(endpointsPath, input, ["state", "cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "webhooks.endpoints.create") {
    return {
      method: "POST",
      path: endpointsPath,
      body: selected(input, ["name", "destination", "subscriptions", "authorityAcknowledged"]),
    } as const;
  }
  const endpointId = "endpointId" in input ? segment(stringField(input, "endpointId")) : null;
  if (procedure === "webhooks.endpoints.update" && endpointId !== null) {
    const destination = input["destination"] ?? null;
    return {
      method: "PATCH",
      path: `${endpointsPath}/${endpointId}`,
      body: {
        expectedVersion: input["expectedVersion"],
        name: input["name"],
        destination,
        destinationReplacementAcknowledged: destination !== null,
      },
    } as const;
  }
  if (procedure === "webhooks.endpoints.setState" && endpointId !== null) {
    return {
      method: "PUT",
      path: `${endpointsPath}/${endpointId}/state`,
      body: {
        expectedVersion: input["expectedVersion"],
        state: input["state"],
        authorityAcknowledged: input["state"] === "disabled",
      },
    } as const;
  }
  if (procedure === "webhooks.endpoints.replaceSubscriptions" && endpointId !== null) {
    return {
      method: "PUT",
      path: `${endpointsPath}/${endpointId}/subscriptions`,
      body: selected(input, ["expectedVersion", "subscriptions"]),
    } as const;
  }
  if (procedure === "webhooks.endpoints.startRotation" && endpointId !== null) {
    return {
      method: "POST",
      path: `${endpointsPath}/${endpointId}/secret-rotations`,
      body: selected(input, ["expectedVersion", "authorityAcknowledged"]),
    } as const;
  }
  if (procedure === "webhooks.endpoints.changeRotation" && endpointId !== null) {
    return {
      method: "POST",
      path: `${endpointsPath}/${endpointId}/secret-rotations/${segment(stringField(input, "action"))}`,
      body: { expectedVersion: input["expectedVersion"], authorityAcknowledged: true },
    } as const;
  }
  if (procedure === "webhooks.mappings.list") {
    return {
      method: "GET",
      path: queryPath(mappingsPath, input, ["state", "cursor", "limit"]),
      body: null,
    } as const;
  }
  if (procedure === "webhooks.mappings.create") {
    return {
      method: "POST",
      path: mappingsPath,
      body: {
        commandId: crypto.randomUUID(),
        ...selected(input, [
          "collectionId",
          "entryId",
          "localeId",
          "name",
          "eventTypes",
          "route",
          "semanticTags",
        ]),
      },
    } as const;
  }
  const mappingId = "mappingId" in input ? segment(stringField(input, "mappingId")) : null;
  if (procedure === "webhooks.mappings.update" && mappingId !== null) {
    return {
      method: "PUT",
      path: `${mappingsPath}/${mappingId}`,
      body: selected(input, [
        "expectedVersion",
        "collectionId",
        "entryId",
        "localeId",
        "name",
        "eventTypes",
        "route",
        "semanticTags",
      ]),
    } as const;
  }
  if (procedure === "webhooks.mappings.setState" && mappingId !== null) {
    return {
      method: "PUT",
      path: `${mappingsPath}/${mappingId}/state`,
      body: selected(input, ["expectedVersion", "state"]),
    } as const;
  }
  if (procedure === "webhooks.deliveries.operationalList") {
    const query = record(input["query"]);
    return {
      method: "GET",
      path: queryPath(deliveriesPath, query, [
        "endpointId",
        "eventType",
        "status",
        "cursor",
        "limit",
      ]),
      body: null,
    } as const;
  }
  if (procedure === "webhooks.deliveries.detail") {
    return {
      method: "GET",
      path: `${deliveriesPath}/${segment(stringField(input, "deliveryId"))}`,
      body: null,
    } as const;
  }
  if (procedure === "webhooks.attempts.operationalList") {
    return {
      method: "GET",
      path: `${deliveriesPath}/${segment(stringField(input, "deliveryId"))}/attempts`,
      body: null,
    } as const;
  }
  if (procedure === "webhooks.deliveries.replay") {
    return {
      method: "POST",
      path: scopedPath(input, "webhook-replays"),
      body: {
        ...selected(input, ["commandId", "endpointId", "eventId", "sourceDeliveryId"]),
        authorityAcknowledged: true,
      },
    } as const;
  }
  return null;
}

/** Returns a canonical Control Plane request for migrated dashboard procedures, otherwise null. */
export function planControlPlaneRequest(
  path: ReadonlyArray<string>,
  input: unknown,
): ControlPlaneRequestPlan | null {
  const procedure = path.join(".");
  if (!procedure.startsWith("platform.") && !procedure.startsWith("webhooks.")) return null;
  const inputRecord = record(input);
  if (procedure === "platform.projects.invitations.inspect") {
    return {
      method: "POST",
      path: `${prefix}/invitations/inspect`,
      body: selected(inputRecord, ["token"]),
    };
  }
  if (procedure === "platform.projects.invitations.accept") {
    return {
      method: "POST",
      path: `${prefix}/invitations/accept`,
      body: selected(inputRecord, ["token"]),
    };
  }
  if (procedure.startsWith("platform.")) return platformPlan(procedure, inputRecord);
  if (procedure.startsWith("webhooks.")) return webhookPlan(procedure, inputRecord);
  return null;
}

/** Reads one Control Plane response without accepting an unbounded browser payload. */
export async function readControlPlaneResponse(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumResponseBytes) {
    throw new Error("Control Plane response exceeded the fixed bound.");
  }
  if (response.body === null) throw new Error("Control Plane response body is missing.");

  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel();
        throw new Error("Control Plane response exceeded the fixed bound.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return parsed;
}

/** Adapts one canonical HTTP envelope to the existing typed dashboard query result shape. */
export function adaptControlPlaneResponse(
  response: Response,
  body: unknown,
  transformData?: (data: unknown) => unknown,
): Response {
  const envelope = record(body);
  if (response.ok && envelope["ok"] === true) {
    const data = transformData === undefined ? envelope["data"] : transformData(envelope["data"]);
    return Response.json({ json: { ...envelope, data } }, { status: response.status });
  }

  const error = record(envelope["error"]);
  return Response.json(
    {
      json: {
        defined: true,
        code: typeof error["code"] === "string" ? error["code"] : "INTERNAL_SERVER_ERROR",
        status: response.status,
        message: typeof envelope["message"] === "string" ? envelope["message"] : "Request failed.",
        data: error,
      },
    },
    { status: response.status },
  );
}
