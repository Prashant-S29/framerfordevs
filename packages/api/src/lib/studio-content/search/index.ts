import { createHash } from "node:crypto";

import { StudioContentSearchText } from "../../../contracts/studio-content";
import { Schema } from "effect";

const likeEscapePattern = /[\\%_]/gu;

export interface StudioSearchAuthority {
  readonly normalized: StudioContentSearchText;
  readonly folded: string;
  readonly likePrefix: string;
  readonly databaseLikePrefix: string;
  readonly queryDigest: string;
}

export function studioSearchAuthority(input: unknown): StudioSearchAuthority {
  const normalized = Schema.decodeUnknownSync(StudioContentSearchText, {
    onExcessProperty: "error",
  })(input);
  const folded = normalized.toLocaleLowerCase("en-US");
  const escaped = folded.replace(likeEscapePattern, (value) => `\\${value}`);
  const databaseEscaped = normalized.replace(likeEscapePattern, (value) => `\\${value}`);
  return {
    normalized,
    folded,
    likePrefix: `${escaped}%`,
    databaseLikePrefix: `${databaseEscaped}%`,
    queryDigest: createHash("sha256")
      .update(`ffd:studio-content-search:v1:${folded}`, "utf8")
      .digest("hex"),
  };
}

export function boundedStudioMatchCount(probedRows: number) {
  if (!Number.isInteger(probedRows) || probedRows < 0 || probedRows > 1_001) {
    throw new RangeError("Studio match-count probes must be integers between 0 and 1,001.");
  }
  return probedRows > 1_000
    ? ({ value: 1_000, relation: "at_least" } as const)
    : ({ value: probedRows, relation: "exact" } as const);
}
