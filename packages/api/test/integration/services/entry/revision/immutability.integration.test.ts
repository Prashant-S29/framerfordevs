import { assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { eq, sql } from "@framerfordevs/db/query";
import { cmsEntryLocaleRevision, cmsEntrySharedRevision } from "@framerfordevs/db/schema/cms";

import {
  createFixtureEntry,
  createRevisionFixture,
  saveFixtureDraft,
  type RevisionFixture,
} from "../../../../support/revision-fixture";

let fixture: RevisionFixture;
let entryId: string;

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const code = Reflect.get(current, "code");
    if (typeof code === "string") return code;
    current = Reflect.get(current, "cause");
  }
  return undefined;
}

async function rejectedCode(statement: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await statement();
  } catch (error) {
    return postgresCode(error);
  }
  return undefined;
}

describe("entry revision immutability", () => {
  beforeAll(async () => {
    fixture = await createRevisionFixture("immutability");
    entryId = await createFixtureEntry(fixture, "Immutable revisions");
    await saveFixtureDraft(fixture, entryId, {
      shared: { [fixture.fields.note]: "Shared note", [fixture.fields.secret]: "Secret" },
      localized: { [fixture.fields.title]: "Localized title" },
    });
  });

  it("rejects updates to shared and localized revision rows", async () => {
    const [shared] = await db
      .select({ id: cmsEntrySharedRevision.id, values: cmsEntrySharedRevision.values })
      .from(cmsEntrySharedRevision)
      .where(eq(cmsEntrySharedRevision.entryId, entryId))
      .limit(1);
    const [localized] = await db
      .select({ id: cmsEntryLocaleRevision.id, values: cmsEntryLocaleRevision.values })
      .from(cmsEntryLocaleRevision)
      .where(eq(cmsEntryLocaleRevision.entryId, entryId))
      .limit(1);
    if (!shared || !localized) throw new Error("Revision fixture rows are unavailable.");

    const sharedCode = await rejectedCode(() =>
      db
        .update(cmsEntrySharedRevision)
        .set({ values: {} })
        .where(eq(cmsEntrySharedRevision.id, shared.id)),
    );
    const localizedCode = await rejectedCode(() =>
      db
        .update(cmsEntryLocaleRevision)
        .set({ values: {} })
        .where(eq(cmsEntryLocaleRevision.id, localized.id)),
    );
    const rawCode = await rejectedCode(() =>
      db.execute(
        sql`update cms_entry_shared_revision set authored_at = authored_at where id = ${shared.id}`,
      ),
    );

    assert.strictEqual(sharedCode, "55000");
    assert.strictEqual(localizedCode, "55000");
    assert.strictEqual(rawCode, "55000");

    const [sharedAfter] = await db
      .select({ values: cmsEntrySharedRevision.values })
      .from(cmsEntrySharedRevision)
      .where(eq(cmsEntrySharedRevision.id, shared.id));
    const [localizedAfter] = await db
      .select({ values: cmsEntryLocaleRevision.values })
      .from(cmsEntryLocaleRevision)
      .where(eq(cmsEntryLocaleRevision.id, localized.id));
    assert.deepStrictEqual(sharedAfter?.values, shared.values);
    assert.deepStrictEqual(localizedAfter?.values, localized.values);
  });
});
