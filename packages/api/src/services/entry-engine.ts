// Exposes the dependency-light M7 entry-value kernel through named replaceable Effect service operations.

import { Context, Effect, Layer } from "effect";

import type { EntryValueMutation, EntryValues } from "../contracts/entries";
import {
  applyEntryMutations,
  canonicalizeEntryValue,
  mergeEntryFragments,
  validateEntryDocument,
} from "../lib/entry-values";

/** Wraps bounded stable-path mutation application in the service effect channel. */
function applyMutationsOperation(
  currentValues: EntryValues,
  mutations: ReadonlyArray<EntryValueMutation>,
) {
  return Effect.succeed(applyEntryMutations(currentValues, mutations));
}

/** Wraps disjoint shared/localized sparse-fragment merging. */
function mergeFragmentsOperation(
  sharedValues: Readonly<Record<string, unknown>>,
  localizedValues: Readonly<Record<string, unknown>>,
) {
  return Effect.succeed(mergeEntryFragments(sharedValues, localizedValues));
}

/** Wraps resource-safety validation for persisted entry documents. */
function validateDocumentOperation(value: unknown) {
  return Effect.succeed(validateEntryDocument(value));
}

/** Wraps deterministic canonical serialization used by persistence hashing. */
function canonicalizeOperation(value: unknown) {
  return Effect.succeed(canonicalizeEntryValue(value));
}

/** Constructs the live entry engine without creating a runtime or local dependency graph. */
export function makeEntryEngine() {
  return {
    applyMutations: Effect.fn("EntryEngine.applyMutations")(applyMutationsOperation),
    mergeFragments: Effect.fn("EntryEngine.mergeFragments")(mergeFragmentsOperation),
    validateDocument: Effect.fn("EntryEngine.validateDocument")(validateDocumentOperation),
    canonicalize: Effect.fn("EntryEngine.canonicalize")(canonicalizeOperation),
  };
}

export class EntryEngine extends Context.Tag("EntryEngine")<
  EntryEngine,
  ReturnType<typeof makeEntryEngine>
>() {}

export const EntryEngineLive = Layer.succeed(EntryEngine, makeEntryEngine());
