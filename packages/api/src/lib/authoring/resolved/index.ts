// Builds and validates one fully allocated M13 collection candidate through existing M5/M6 kernels.

import type { CollectionSchema } from "@framerfordevs/schema";

import {
  type CmsCollection,
  CollectionApiKey,
  currentCurrencyRegistryProfile,
  type PublishedSchemaRevision,
  type SchemaChangeSet,
  type SchemaHash,
  type ContractHash,
} from "../../../contracts/schema";
import type { StructureHash } from "../../../contracts/authoring";
import {
  classifyCollectionSchemaChanges,
  hashCollectionContract,
  hashCollectionDraft,
  requiredAcknowledgementChanges,
  validateCollectionDraft,
  type SchemaDraftState,
} from "../../../services/schema/engine";
import { compileCodeCollectionFields, type CodeSchemaCandidateIssue } from "../candidate";
import { type CodeLayoutAllocations, reconcileCodeEditorLayout } from "../layout";
import { flattenFieldTree } from "../../field/tree";
import {
  computeCollectionStructureHash,
  type StructureHashIssue,
  type StructureIdentityMap,
} from "../hash";

export interface ResolvedSchemaCandidateIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ResolvedSchemaCandidate {
  readonly draft: SchemaDraftState;
  readonly structureHash: StructureHash;
  readonly contractHash: ContractHash;
  readonly schemaHash: SchemaHash;
  readonly changes: SchemaChangeSet;
  readonly requiredAcknowledgementIds: ReadonlyArray<string>;
  readonly noOp: boolean;
}

export type BuildResolvedSchemaCandidateResult =
  | { readonly valid: true; readonly candidate: ResolvedSchemaCandidate }
  | { readonly valid: false; readonly issues: ReadonlyArray<ResolvedSchemaCandidateIssue> };

function candidateIssue(issue: CodeSchemaCandidateIssue | StructureHashIssue) {
  return {
    path: issue.path,
    code: issue.code,
    message: "message" in issue ? issue.message : "The code schema source identity is unresolved.",
  };
}

/**
 * Runs only with server-allocated identities. It merges current hosted presentation, then delegates
 * validation, contract hashing, management hashing, and change classification to existing kernels.
 */
export function buildResolvedSchemaCandidate(options: {
  readonly schema: CollectionSchema;
  readonly collection: CmsCollection;
  readonly identities: StructureIdentityMap;
  readonly currentPublished: PublishedSchemaRevision | null;
  readonly layoutAllocations: CodeLayoutAllocations;
}): BuildResolvedSchemaCandidateResult {
  const compiled = compileCodeCollectionFields(
    options.schema,
    options.identities,
    options.currentPublished,
  );
  if (!compiled.valid) {
    return { valid: false, issues: compiled.issues.map(candidateIssue) };
  }
  const layout = reconcileCodeEditorLayout(
    options.currentPublished?.editorLayout ?? null,
    compiled.fields,
    options.layoutAllocations,
  );
  if (!layout.valid) return { valid: false, issues: layout.issues };

  const structure = computeCollectionStructureHash(options.schema, options.identities);
  if (!structure.valid) {
    return { valid: false, issues: structure.issues.map(candidateIssue) };
  }
  const hasMoney = flattenFieldTree(compiled.fields).some((field) => field.kind === "money");
  const draft: SchemaDraftState = {
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: hasMoney ? currentCurrencyRegistryProfile : null,
    collection: {
      ...options.collection,
      apiKey: CollectionApiKey.make(options.schema.apiKey),
    },
    fields: compiled.fields,
    editorLayout: layout.editorLayout,
  };
  const validation = validateCollectionDraft(draft, "publication");
  if (!validation.valid) {
    return {
      valid: false,
      issues: validation.issues.map(({ path, code, message }) => ({ path, code, message })),
    };
  }

  const contractHash = hashCollectionContract(draft);
  const schemaHash = hashCollectionDraft(draft);
  const changes = classifyCollectionSchemaChanges(options.currentPublished, draft);
  return {
    valid: true,
    candidate: {
      draft,
      structureHash: structure.structureHash,
      contractHash,
      schemaHash,
      changes,
      requiredAcknowledgementIds: requiredAcknowledgementChanges(changes).map(
        (change) => change.changeId,
      ),
      noOp: options.currentPublished?.schemaHash === schemaHash,
    },
  };
}
