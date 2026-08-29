import { assert, describe, it } from "@effect/vitest";

import { authoringSchemaRequestCost } from "./index";

describe("Authoring public operation bounds", () => {
  it("uses closed 64 KiB weighted schema quotas with a hard cost ceiling", () => {
    assert.strictEqual(authoringSchemaRequestCost(0, "plan"), 1);
    assert.strictEqual(authoringSchemaRequestCost(65_536, "plan"), 2);
    assert.strictEqual(authoringSchemaRequestCost(65_537, "plan"), 3);
    assert.strictEqual(authoringSchemaRequestCost(0, "apply"), 2);
    assert.strictEqual(authoringSchemaRequestCost(65_536, "apply"), 4);
    assert.strictEqual(authoringSchemaRequestCost(65_537, "apply"), 6);
    assert.strictEqual(authoringSchemaRequestCost(10_000_000, "plan"), 100);
    assert.strictEqual(authoringSchemaRequestCost(10_000_000, "apply"), 100);
  });
});
