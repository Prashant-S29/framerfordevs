// Canonicalizes Control Plane command intent into receipt-safe, actor- and scope-bound fingerprints.

import { createHash } from "node:crypto";

import type {
  ControlPlaneActor,
  ControlPlaneCommandOperation,
} from "../../../contracts/control-plane";
import type { EnvironmentId, ProjectId, WorkspaceId } from "../../../contracts/platform";

export type ControlPlaneFingerprintValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<ControlPlaneFingerprintValue>
  | { readonly [key: string]: ControlPlaneFingerprintValue };

export interface ControlPlaneCommandScope {
  readonly workspaceId: WorkspaceId | null;
  readonly projectId: ProjectId | null;
  readonly environmentId: EnvironmentId | null;
}

export interface ControlPlaneCommandFingerprintInput {
  readonly operation: ControlPlaneCommandOperation;
  readonly actor: ControlPlaneActor;
  readonly scope: ControlPlaneCommandScope;
  readonly input: ControlPlaneFingerprintValue;
}

function isFingerprintArray(
  value: ControlPlaneFingerprintValue,
): value is ReadonlyArray<ControlPlaneFingerprintValue> {
  return Array.isArray(value);
}

function canonicalJson(value: ControlPlaneFingerprintValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Fingerprint numbers must be finite.");
    return JSON.stringify(value);
  }
  if (isFingerprintArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`);
  return `{${entries.join(",")}}`;
}

/** Binds one decoded command to its operation, actual actor, exact tenant scope, and input. */
export function controlPlaneCommandFingerprint(
  command: ControlPlaneCommandFingerprintInput,
): string {
  const canonical = canonicalJson({
    version: 1,
    operation: command.operation,
    actor: {
      kind: command.actor.kind,
      id: command.actor.id,
    },
    scope: {
      workspaceId: command.scope.workspaceId,
      projectId: command.scope.projectId,
      environmentId: command.scope.environmentId,
    },
    input: command.input,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function controlPlaneActorReferences(actor: ControlPlaneActor): {
  readonly actorType: "user" | "credential";
  readonly actorId: string;
  readonly userId: string | null;
  readonly credentialId: string | null;
} {
  return actor.kind === "user"
    ? {
        actorType: "user",
        actorId: actor.id,
        userId: actor.id,
        credentialId: null,
      }
    : {
        actorType: "credential",
        actorId: actor.id,
        userId: null,
        credentialId: actor.id,
      };
}
