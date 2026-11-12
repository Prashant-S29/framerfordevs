import { Schema } from "effect";

export const Uuid = Schema.String.check(Schema.isUUID());
