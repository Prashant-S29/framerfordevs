import { Context, Effect, Layer } from "effect";

import type { EntryValueMutation, EntryValues } from "../../../contracts/entry";
import {
  applyEntryMutations,
  canonicalizeEntryValue,
  mergeEntryFragments,
  validateEntryDocument,
} from "../../../lib/entry/values";

function applyMutationsOperation(
  currentValues: EntryValues,
  mutations: ReadonlyArray<EntryValueMutation>,
) {
  return Effect.succeed(applyEntryMutations(currentValues, mutations));
}

function mergeFragmentsOperation(
  sharedValues: Readonly<Record<string, unknown>>,
  localizedValues: Readonly<Record<string, unknown>>,
) {
  return Effect.succeed(mergeEntryFragments(sharedValues, localizedValues));
}

function validateDocumentOperation(value: unknown) {
  return Effect.succeed(validateEntryDocument(value));
}

function canonicalizeOperation(value: unknown) {
  return Effect.succeed(canonicalizeEntryValue(value));
}

export function makeEntryEngine() {
  return {
    applyMutations: Effect.fn("EntryEngine.applyMutations")(applyMutationsOperation),
    mergeFragments: Effect.fn("EntryEngine.mergeFragments")(mergeFragmentsOperation),
    validateDocument: Effect.fn("EntryEngine.validateDocument")(validateDocumentOperation),
    canonicalize: Effect.fn("EntryEngine.canonicalize")(canonicalizeOperation),
  };
}

export class EntryEngine extends Context.Service<EntryEngine, ReturnType<typeof makeEntryEngine>>()(
  "EntryEngine",
) {}

export const EntryEngineLive = Layer.succeed(EntryEngine, makeEntryEngine());
