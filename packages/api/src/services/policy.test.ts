import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import {
  credentialScopeValues,
  projectPermissionActionValues,
  projectRoleValues,
} from "../contracts/access";
import { PolicyService, PolicyServiceLive } from "./policy";

const workspaceId = "019fae8b-1234-7000-8000-000000000001";
const projectId = "019fae8b-1234-7000-8000-000000000002";
const environmentId = "019fae8b-1234-7000-8000-000000000003";

const expectedAllowedActions = {
  owner: new Set(projectPermissionActionValues),
  developer: new Set([
    "project.read",
    "project.update",
    "project.capability.manage",
    "project.member.read",
    "project.credential.read",
    "project.credential.issue",
    "project.credential.rotate",
    "project.credential.revoke",
    "locale.read",
    "locale.manage",
    "schema.read",
    "schema.write",
    "schema.publish",
    "content.read",
    "content.write",
    "content.review",
    "content.publish",
    "webhook.read",
    "webhook.manage",
  ]),
  content_admin: new Set([
    "project.read",
    "locale.read",
    "schema.read",
    "content.read",
    "content.write",
    "content.review",
    "content.publish",
  ]),
  editor: new Set(["project.read", "locale.read", "schema.read", "content.read", "content.write"]),
  reviewer: new Set([
    "project.read",
    "locale.read",
    "schema.read",
    "content.read",
    "content.review",
    "content.publish",
  ]),
  client_editor: new Set([
    "project.read",
    "locale.read",
    "schema.read",
    "content.read",
    "content.write",
  ]),
  read_only: new Set(["project.read", "locale.read", "schema.read", "content.read"]),
} satisfies Readonly<Record<(typeof projectRoleValues)[number], ReadonlySet<string>>>;

function userRequest(role: string, action: string) {
  return {
    role,
    action,
    subjectWorkspaceId: workspaceId,
    subjectProjectId: projectId,
    workspaceId,
    projectId,
    isActive: true,
  };
}

function credentialRequest(options: {
  readonly family: string;
  readonly action: string;
  readonly scopes: ReadonlyArray<string>;
}) {
  return {
    ...options,
    subjectWorkspaceId: workspaceId,
    subjectProjectId: projectId,
    subjectEnvironmentId: environmentId,
    workspaceId,
    projectId,
    environmentId,
    isActive: true,
  };
}

describe("PolicyService", () => {
  layer(PolicyServiceLive)((it) => {
    for (const role of projectRoleValues) {
      for (const action of projectPermissionActionValues) {
        it.effect(
          `${role} explicitly ${expectedAllowedActions[role].has(action) ? "allows" : "denies"} ${action}`,
          () =>
            Effect.gen(function* () {
              const policy = yield* PolicyService;
              const decision = yield* policy.decideUser(userRequest(role, action));
              assert.strictEqual(decision.allowed, expectedAllowedActions[role].has(action));
            }),
        );
      }
    }

    it.effect(
      "defaults to deny for unknown actions, missing context, inactive subjects, and explicit denials",
      () =>
        Effect.gen(function* () {
          const policy = yield* PolicyService;
          const decisions = yield* Effect.all([
            policy.decideUser(userRequest("owner", "unknown.action")),
            policy.decideUser({ ...userRequest("owner", "project.read"), projectId: null }),
            policy.decideUser({ ...userRequest("owner", "project.read"), isActive: false }),
            policy.decideUser({
              ...userRequest("owner", "project.read"),
              hasExplicitDeny: true,
            }),
            policy.decideUser({
              ...userRequest("owner", "project.read"),
              subjectProjectId: "019fae8b-1234-7000-8000-000000000099",
            }),
          ]);

          assert.isTrue(decisions.every((decision) => !decision.allowed));
          assert.deepEqual(
            decisions.map((decision) => decision.reason),
            [
              "unknown_action",
              "missing_context",
              "inactive_subject",
              "explicit_deny",
              "scope_mismatch",
            ],
          );
        }),
    );

    it.effect("keeps credential families disjoint and requires an explicit compatible scope", () =>
      Effect.gen(function* () {
        const policy = yield* PolicyService;
        const management = yield* policy.decideCredential(
          credentialRequest({
            family: "management",
            action: "content.write",
            scopes: ["content.write"],
          }),
        );
        const delivery = yield* policy.decideCredential(
          credentialRequest({
            family: "delivery",
            action: "delivery.read",
            scopes: ["delivery.read"],
          }),
        );
        const preview = yield* policy.decideCredential(
          credentialRequest({
            family: "preview",
            action: "preview.read",
            scopes: ["preview.read"],
          }),
        );
        const denied = yield* Effect.all([
          policy.decideCredential(
            credentialRequest({
              family: "delivery",
              action: "content.read",
              scopes: ["delivery.read"],
            }),
          ),
          policy.decideCredential(
            credentialRequest({
              family: "preview",
              action: "delivery.read",
              scopes: ["preview.read"],
            }),
          ),
          policy.decideCredential(
            credentialRequest({
              family: "management",
              action: "schema.publish",
              scopes: ["schema.read"],
            }),
          ),
          policy.decideCredential(
            credentialRequest({
              family: "management",
              action: "content.read",
              scopes: ["delivery.read"],
            }),
          ),
          policy.decideCredential({
            ...credentialRequest({
              family: "management",
              action: "content.read",
              scopes: ["content.read"],
            }),
            environmentId: "019fae8b-1234-7000-8000-000000000099",
          }),
        ]);

        assert.isTrue(management.allowed);
        assert.isTrue(delivery.allowed);
        assert.isTrue(preview.allowed);
        assert.isTrue(denied.every((decision) => !decision.allowed));
      }),
    );

    it.effect("rejects every scope when paired with an incompatible family", () =>
      Effect.gen(function* () {
        const policy = yield* PolicyService;
        for (const scope of credentialScopeValues) {
          const delivery = yield* policy.decideCredential(
            credentialRequest({ family: "delivery", action: scope, scopes: [scope] }),
          );
          const preview = yield* policy.decideCredential(
            credentialRequest({ family: "preview", action: scope, scopes: [scope] }),
          );
          assert.strictEqual(delivery.allowed, scope === "delivery.read");
          assert.strictEqual(preview.allowed, scope === "preview.read");
        }
      }),
    );
  });
});
