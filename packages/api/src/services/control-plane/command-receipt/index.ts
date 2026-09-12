// Owns serialized inspection and persistence of bounded Control Plane command receipts.

import { eq, sql } from "@framerfordevs/db/query";
import { controlPlaneCommandReceipt } from "@framerfordevs/db/schema/control-plane";

import type {
  ControlPlaneActor,
  ControlPlaneCommandId,
  ControlPlaneCommandOperation,
} from "../../../contracts/control-plane";
import type { EnvironmentId, ProjectId, WorkspaceId } from "../../../contracts/platform";
import { controlPlaneActorReferences } from "../../../lib/control-plane/command-fingerprint";
import type { ApplicationTransaction } from "../../project-access";

export type ControlPlaneReceiptResourceType =
  | "workspace"
  | "project"
  | "project_capability"
  | "studio_registration";
export type ControlPlaneReceiptDisposition = "created" | "updated" | "no_op";

export interface ControlPlaneCreateReceiptExpectation {
  readonly commandId: ControlPlaneCommandId;
  readonly operation: "workspace.create" | "project.create";
  readonly actor: Extract<ControlPlaneActor, { readonly kind: "user" }>;
  readonly fingerprint: string;
  readonly workspaceId: WorkspaceId | null;
}

export interface ControlPlaneReceiptExpectation {
  readonly commandId: ControlPlaneCommandId;
  readonly operation: ControlPlaneCommandOperation;
  readonly actor: ControlPlaneActor;
  readonly fingerprint: string;
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId | null;
  readonly environmentId: EnvironmentId | null;
}

export interface ControlPlaneReceiptResult {
  readonly resourceType: ControlPlaneReceiptResourceType;
  readonly resourceId: string;
  readonly disposition: ControlPlaneReceiptDisposition;
}

export type ControlPlaneCreateReceiptInspection =
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" }
  | {
      readonly kind: "replay";
      readonly workspaceId: string;
      readonly projectId: string | null;
      readonly resourceId: string;
    };

export type ControlPlaneReceiptInspection =
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" }
  | ({ readonly kind: "replay" } & ControlPlaneReceiptResult);

type ReceiptRow = typeof controlPlaneCommandReceipt.$inferSelect;

function equalNullable(left: string | null, right: string | null): boolean {
  return left === right;
}

function isReceiptResourceType(value: string): value is ControlPlaneReceiptResourceType {
  return (
    value === "workspace" ||
    value === "project" ||
    value === "project_capability" ||
    value === "studio_registration"
  );
}

function isReceiptDisposition(value: string): value is ControlPlaneReceiptDisposition {
  return value === "created" || value === "updated" || value === "no_op";
}

export function controlPlaneReceiptMatches(
  receipt: Pick<
    ReceiptRow,
    | "operation"
    | "actorType"
    | "actorId"
    | "fingerprint"
    | "workspaceId"
    | "projectId"
    | "environmentId"
  >,
  expectation: ControlPlaneReceiptExpectation,
): boolean {
  return (
    receipt.operation === expectation.operation &&
    receipt.actorType === expectation.actor.kind &&
    receipt.actorId === expectation.actor.id &&
    receipt.fingerprint === expectation.fingerprint &&
    receipt.workspaceId === expectation.workspaceId &&
    equalNullable(receipt.projectId, expectation.projectId) &&
    equalNullable(receipt.environmentId, expectation.environmentId)
  );
}

function actorMatches(
  receipt: Pick<ReceiptRow, "actorType" | "actorId">,
  actor: ControlPlaneActor,
): boolean {
  return receipt.actorType === actor.kind && receipt.actorId === actor.id;
}

/** Prevents same-command races from mutating before the committed receipt can be replayed. */
export async function lockControlPlaneCommand(
  transaction: ApplicationTransaction,
  commandId: ControlPlaneCommandId,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${commandId}::text, 0))`,
  );
}

export async function inspectControlPlaneCreateReceipt(
  transaction: ApplicationTransaction,
  expectation: ControlPlaneCreateReceiptExpectation,
): Promise<ControlPlaneCreateReceiptInspection> {
  await lockControlPlaneCommand(transaction, expectation.commandId);
  const [receipt] = await transaction
    .select()
    .from(controlPlaneCommandReceipt)
    .where(eq(controlPlaneCommandReceipt.commandId, expectation.commandId))
    .limit(1);
  if (!receipt) return { kind: "missing" };
  if (
    receipt.operation !== expectation.operation ||
    !actorMatches(receipt, expectation.actor) ||
    receipt.fingerprint !== expectation.fingerprint ||
    receipt.environmentId !== null ||
    receipt.resultDisposition !== "created" ||
    receipt.resultResourceId !==
      (expectation.operation === "workspace.create" ? receipt.workspaceId : receipt.projectId) ||
    (expectation.operation === "workspace.create" &&
      (expectation.workspaceId !== null ||
        receipt.projectId !== null ||
        receipt.resultResourceType !== "workspace")) ||
    (expectation.operation === "project.create" &&
      (expectation.workspaceId === null ||
        receipt.workspaceId !== expectation.workspaceId ||
        receipt.projectId === null ||
        receipt.resultResourceType !== "project"))
  ) {
    return { kind: "conflict" };
  }
  return {
    kind: "replay",
    workspaceId: receipt.workspaceId,
    projectId: receipt.projectId,
    resourceId: receipt.resultResourceId,
  };
}

export async function inspectControlPlaneReceipt(
  transaction: ApplicationTransaction,
  expectation: ControlPlaneReceiptExpectation,
): Promise<ControlPlaneReceiptInspection> {
  await lockControlPlaneCommand(transaction, expectation.commandId);
  const [receipt] = await transaction
    .select()
    .from(controlPlaneCommandReceipt)
    .where(eq(controlPlaneCommandReceipt.commandId, expectation.commandId))
    .limit(1);
  if (!receipt) return { kind: "missing" };
  if (
    !controlPlaneReceiptMatches(receipt, expectation) ||
    !isReceiptResourceType(receipt.resultResourceType) ||
    !isReceiptDisposition(receipt.resultDisposition)
  ) {
    return { kind: "conflict" };
  }
  return {
    kind: "replay",
    resourceType: receipt.resultResourceType,
    resourceId: receipt.resultResourceId,
    disposition: receipt.resultDisposition,
  };
}

export async function persistControlPlaneReceipt(
  transaction: ApplicationTransaction,
  expectation: ControlPlaneReceiptExpectation,
  result: ControlPlaneReceiptResult,
  createdAt: Date,
): Promise<void> {
  const actor = controlPlaneActorReferences(expectation.actor);
  await transaction.insert(controlPlaneCommandReceipt).values({
    commandId: expectation.commandId,
    operation: expectation.operation,
    actorType: actor.actorType,
    actorId: actor.actorId,
    fingerprint: expectation.fingerprint,
    workspaceId: expectation.workspaceId,
    projectId: expectation.projectId,
    environmentId: expectation.environmentId,
    resultResourceType: result.resourceType,
    resultResourceId: result.resourceId,
    resultDisposition: result.disposition,
    createdAt,
  });
}
