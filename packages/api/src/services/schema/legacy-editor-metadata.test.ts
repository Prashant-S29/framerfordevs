import { assert, describe, it } from "@effect/vitest";

import { defaultFieldEditorMetadata } from "../../contracts/schema";
import { decodePersistedFieldEditorMetadataSync } from "./repository";

describe("legacy field editor metadata", () => {
  it("expands the M6 empty-object backfill for historical M5 fields", () => {
    const editor = decodePersistedFieldEditorMetadataSync({});

    assert.deepEqual(editor, defaultFieldEditorMetadata);
    assert.isTrue(editor.visibleToRoles.includes("owner"));
    assert.isTrue(editor.visibleToRoles.includes("developer"));
    assert.isTrue(editor.editableByRoles.includes("owner"));
    assert.isTrue(editor.editableByRoles.includes("developer"));
  });

  it("rejects malformed non-sentinel persisted metadata", () => {
    assert.throws(() =>
      decodePersistedFieldEditorMetadataSync({
        visibleToRoles: ["owner"],
        editableByRoles: ["owner", "unknown_role"],
      }),
    );
  });
});
