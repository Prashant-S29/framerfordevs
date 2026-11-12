// Keeps the v3 `Schema.UUID` contract: any hex 8-4-4-4-12 identifier, published as the shared `UUID` JSON Schema definition.

import { Schema } from "effect";

const uuidPattern =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;

const uuidAnnotations = {
  description: "a Universally Unique Identifier",
  expected: "a Universally Unique Identifier",
  jsonSchema: { format: "uuid", pattern: uuidPattern.source },
};

/**
 * UUID string without the shared identifier.
 * v3 dropped an inherited identifier when a schema was branded, so branded IDs build on this base and stay inline.
 */
export const UuidValue = Schema.String.check(Schema.isPattern(uuidPattern, uuidAnnotations));

/** Plain UUID string, published as the shared `UUID` definition. */
export const Uuid = Schema.String.check(
  Schema.isPattern(uuidPattern, { ...uuidAnnotations, identifier: "UUID" }),
);
