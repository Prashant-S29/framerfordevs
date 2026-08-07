// Defines deterministic M6 field validation limits without importing server or Effect dependencies.

export const fieldSystemValidationProfile = "ffd-fields@1" as const;

export const fieldSystemLimits = {
  aggregateSchemaBytes: 1_048_576,
  configurationBytes: 327_680,
  definitionMaxDepth: 8,
  directObjectProperties: 50,
  fieldNodes: 100,
  issues: 50,
  listItems: 100,
  valueBytes: 262_144,
} as const;
