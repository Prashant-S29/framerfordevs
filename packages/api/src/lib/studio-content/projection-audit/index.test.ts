import { assert, describe, it } from "@effect/vitest";

import { SchemaRevisionId } from "../../../contracts/schema";
import { projectionInvalidAuditId, projectionInvalidAuditRequestId } from "./index";

const firstRevisionId = SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000001");
const secondRevisionId = SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000002");

describe("Studio projection-invalid audit identity", () => {
  it("binds one deterministic namespaced audit primary key to each immutable revision", () => {
    const first = projectionInvalidAuditId(firstRevisionId);

    assert.strictEqual(first, "3cd7d5fd-3204-53d9-8508-3613417937ca");
    assert.strictEqual(projectionInvalidAuditId(firstRevisionId), first);
    assert.notStrictEqual(projectionInvalidAuditId(secondRevisionId), first);
    assert.strictEqual(
      projectionInvalidAuditRequestId(first),
      "studio-projection-invalid:3cd7d5fd-3204-53d9-8508-3613417937ca",
    );
  });
});
