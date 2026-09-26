import { assert, describe, it } from "@effect/vitest";

import { projectAuditCategory } from "./index";

describe("project audit categories", () => {
  it("classifies current operational action families", () => {
    assert.strictEqual(projectAuditCategory("project.credential.rotation_started"), "security");
    assert.strictEqual(projectAuditCategory("project.audit.read"), "security");
    assert.strictEqual(projectAuditCategory("studio.session.established"), "security");
    assert.strictEqual(projectAuditCategory("studio.registration.runtime.activated"), "security");
    assert.strictEqual(projectAuditCategory("project.archived"), "project");
    assert.strictEqual(projectAuditCategory("project.membership.policy.updated"), "governance");
    assert.strictEqual(projectAuditCategory("project.locale.created"), "governance");
    assert.strictEqual(projectAuditCategory("cms.schema.field.updated"), "schema");
    assert.strictEqual(projectAuditCategory("cms.entry.shared_draft.saved"), "content");
    assert.strictEqual(projectAuditCategory("cms.entry.locale.published"), "publication");
    assert.strictEqual(projectAuditCategory("cms.webhook.delivery.replayed"), "webhook");
    assert.strictEqual(projectAuditCategory("cms.invalidation.route.updated"), "webhook");
    assert.strictEqual(projectAuditCategory("tooling.schema_manifest.read"), "tooling");
  });

  it("retains unknown historical actions in other", () => {
    assert.strictEqual(projectAuditCategory("legacy.action"), "other");
  });
});
