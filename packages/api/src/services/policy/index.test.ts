import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  credentialScopeValues,
  projectPermissionActionValues,
  projectRoleValues,
} from "../../contracts/access";
import { ProjectLocaleId } from "../../contracts/locale";
import {
  PolicyService,
  PolicyServiceLive,
  fixedProjectRolePolicies,
  projectPolicyProjection,
} from "./index";

const workspaceId = "019fae8b-1234-7000-8000-000000000001";
const projectId = "019fae8b-1234-7000-8000-000000000002";
const environmentId = "019fae8b-1234-7000-8000-000000000003";
const localeId = "019fae8b-1234-7000-8000-000000000004";
const otherLocaleId = "019fae8b-1234-7000-8000-000000000005";
const disabledLocaleId = "019fae8b-1234-7000-8000-000000000006";
const projectLocaleId = Schema.decodeUnknownSync(ProjectLocaleId)(localeId);
const otherProjectLocaleId = Schema.decodeUnknownSync(ProjectLocaleId)(otherLocaleId);
const disabledProjectLocaleId = Schema.decodeUnknownSync(ProjectLocaleId)(disabledLocaleId);

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
    "delivery.configure",
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
    localeAccessMode: "all",
    allowedLocaleIds: [],
    requestedLocaleId: action.startsWith("content.") ? localeId : null,
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

    it.effect("enforces exact selected locale access and denies missing content context", () =>
      Effect.gen(function* () {
        const policy = yield* PolicyService;
        const selected = {
          ...userRequest("editor", "content.write"),
          localeAccessMode: "selected",
          allowedLocaleIds: [localeId],
        };
        const decisions = yield* Effect.all([
          policy.decideUser({ ...selected, requestedLocaleId: localeId }),
          policy.decideUser({ ...selected, requestedLocaleId: otherLocaleId }),
          policy.decideUser({ ...selected, requestedLocaleId: null }),
          policy.decideUser({
            ...selected,
            action: "locale.manage",
            requestedLocaleId: null,
          }),
          policy.decideUser({
            ...selected,
            action: "project.credential.issue",
            requestedLocaleId: null,
          }),
          policy.decideUser({
            ...selected,
            action: "project.credential.revoke",
            requestedLocaleId: null,
          }),
        ]);

        assert.deepEqual(
          decisions.map((decision) => [decision.allowed, decision.reason]),
          [
            [true, "allowed"],
            [false, "locale_denied"],
            [false, "missing_context"],
            [false, "role_denied"],
            [false, "role_denied"],
            [false, "role_denied"],
          ],
        );
      }),
    );

    for (const action of ["content.read", "content.publish"] as const) {
      it.effect(`applies the complete role and locale-access matrix to ${action}`, () =>
        Effect.gen(function* () {
          const policy = yield* PolicyService;
          for (const role of projectRoleValues) {
            const roleAllowed = expectedAllowedActions[role].has(action);
            const base = userRequest(role, action);
            const decisions = yield* Effect.all([
              policy.decideUser({
                ...base,
                localeAccessMode: "all",
                requestedLocaleId: localeId,
              }),
              policy.decideUser({
                ...base,
                localeAccessMode: "selected",
                allowedLocaleIds: [localeId],
                requestedLocaleId: localeId,
              }),
              policy.decideUser({
                ...base,
                localeAccessMode: "selected",
                allowedLocaleIds: [localeId],
                requestedLocaleId: otherLocaleId,
              }),
              policy.decideUser({
                ...base,
                localeAccessMode: "none",
                requestedLocaleId: localeId,
              }),
            ]);
            assert.deepEqual(
              decisions.map((decision) => decision.allowed),
              [roleAllowed, roleAllowed, false, false],
              `${role} ${action} locale matrix`,
            );
          }
        }),
      );
    }

    it.effect(
      "prevents locale-restricted developers from managing locales or issuing credentials",
      () =>
        Effect.gen(function* () {
          const policy = yield* PolicyService;
          const selectedDeveloper = {
            ...userRequest("developer", "locale.manage"),
            localeAccessMode: "selected",
            allowedLocaleIds: [localeId],
          };
          const decisions = yield* Effect.all([
            policy.decideUser(selectedDeveloper),
            policy.decideUser({ ...selectedDeveloper, action: "schema.write" }),
            policy.decideUser({ ...selectedDeveloper, action: "schema.publish" }),
            policy.decideUser({ ...selectedDeveloper, action: "delivery.configure" }),
            policy.decideUser({ ...selectedDeveloper, action: "project.credential.issue" }),
            policy.decideUser({ ...selectedDeveloper, action: "project.credential.rotate" }),
            policy.decideUser({ ...selectedDeveloper, action: "webhook.read" }),
            policy.decideUser({ ...selectedDeveloper, action: "webhook.manage" }),
            policy.decideUser({ ...selectedDeveloper, action: "project.credential.revoke" }),
            policy.decideUser({ ...selectedDeveloper, action: "locale.read" }),
          ]);

          assert.deepEqual(
            decisions.map((decision) => decision.allowed),
            [false, false, false, false, false, false, false, false, true, true],
          );
        }),
    );

    it.effect("keeps archive and restore owner-only and outside credential authority", () =>
      Effect.gen(function* () {
        const policy = yield* PolicyService;
        const decisions = yield* Effect.all([
          policy.decideUser(userRequest("owner", "project.archive")),
          policy.decideUser(userRequest("owner", "project.restore")),
          policy.decideUser(userRequest("developer", "project.archive")),
          policy.decideUser(userRequest("developer", "project.restore")),
          policy.decideCredential(
            credentialRequest({
              family: "management",
              action: "project.archive",
              scopes: ["project.update"],
            }),
          ),
          policy.decideCredential(
            credentialRequest({
              family: "management",
              action: "project.restore",
              scopes: ["project.update"],
            }),
          ),
        ]);

        assert.deepEqual(
          decisions.map((decision) => decision.allowed),
          [true, true, false, false, false, false],
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

  it("keeps canonical role order and base actions in the fixed registry", () => {
    assert.deepEqual(
      fixedProjectRolePolicies.map((policy) => policy.role),
      [...projectRoleValues],
    );
    for (const policy of fixedProjectRolePolicies) {
      assert.deepEqual(new Set(policy.baseRoleActions), expectedAllowedActions[policy.role]);
      assert.strictEqual(policy.requiresAllLocaleAccess, policy.role === "owner");
    }
  });

  it("derives restricted developer projection from the canonical policy kernel", () => {
    const projection = projectPolicyProjection({
      role: "developer",
      localeAccess: {
        mode: "selected",
        localeIds: [projectLocaleId, disabledProjectLocaleId],
      },
      enabledLocaleIds: [projectLocaleId, otherProjectLocaleId],
    });

    assert.includeMembers(projection.baseRoleActions, [
      "schema.write",
      "schema.publish",
      "delivery.configure",
      "webhook.read",
      "webhook.manage",
      "content.write",
      "project.credential.revoke",
    ]);
    assert.notIncludeMembers(projection.effectiveProjectActions, [
      "schema.write",
      "schema.publish",
      "delivery.configure",
      "webhook.read",
      "webhook.manage",
      "content.read",
      "content.write",
      "content.review",
      "content.publish",
    ]);
    assert.includeMembers(projection.effectiveProjectActions, [
      "project.read",
      "locale.read",
      "project.credential.revoke",
    ]);
    assert.deepEqual(projection.configuredLocaleIds, [projectLocaleId, disabledProjectLocaleId]);
    assert.deepEqual(projection.effectiveLocaleIds, [projectLocaleId]);
    assert.deepEqual(projection.effectiveLocaleActions, [
      "content.read",
      "content.write",
      "content.review",
      "content.publish",
    ]);
  });

  it("keeps configured grants while suspending unavailable or denied locale authority", () => {
    const selectedUnavailable = projectPolicyProjection({
      role: "editor",
      localeAccess: { mode: "selected", localeIds: [disabledProjectLocaleId] },
      enabledLocaleIds: [projectLocaleId],
    });
    const none = projectPolicyProjection({
      role: "developer",
      localeAccess: { mode: "none" },
      enabledLocaleIds: [projectLocaleId],
    });
    const all = projectPolicyProjection({
      role: "editor",
      localeAccess: { mode: "all" },
      enabledLocaleIds: [projectLocaleId, otherProjectLocaleId, projectLocaleId],
    });

    assert.deepEqual(selectedUnavailable.configuredLocaleIds, [disabledProjectLocaleId]);
    assert.deepEqual(selectedUnavailable.effectiveLocaleIds, []);
    assert.deepEqual(selectedUnavailable.effectiveLocaleActions, []);
    assert.deepEqual(none.configuredLocaleIds, []);
    assert.deepEqual(none.effectiveLocaleIds, []);
    assert.deepEqual(none.effectiveLocaleActions, []);
    assert.deepEqual(all.effectiveLocaleIds, [projectLocaleId, otherProjectLocaleId]);
    assert.deepEqual(all.effectiveLocaleActions, ["content.read", "content.write"]);
    assert.notInclude(all.effectiveProjectActions, "content.read");
    assert.notInclude(all.effectiveProjectActions, "content.write");
  });
});
