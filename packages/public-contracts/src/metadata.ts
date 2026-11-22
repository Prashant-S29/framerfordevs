export const publicContractFamilies = [
  "authoring",
  "control-plane",
  "delivery",
  "preview",
  "studio",
  "studio-content",
  "tooling",
  "webhooks",
] as const;
export type PublicContractFamily = (typeof publicContractFamilies)[number];

export const publicContractMajors = ["v1"] as const;
export type PublicContractMajor = (typeof publicContractMajors)[number];

export const publicArtifactKinds = ["openapi", "json-schema"] as const;
export type PublicArtifactKind = (typeof publicArtifactKinds)[number];

export interface PublicContractMetadataEntry {
  readonly family: PublicContractFamily;
  readonly major: PublicContractMajor;
  readonly kind: PublicArtifactKind;
  readonly outputPath: string;
  readonly portalRoute: string;
  readonly sdkSupported: boolean;
  readonly deprecatedAt: null;
  readonly sunsetAt: null;
}

export const publicContractRegistryKeys = [
  "authoring/v1",
  "control-plane/v1",
  "delivery/v1",
  "preview/v1",
  "studio/v1",
  "studio-content/v1",
  "tooling/v1",
  "webhooks/v1",
] as const;
export type PublicContractRegistryKey = (typeof publicContractRegistryKeys)[number];

export const publicContractMetadata = {
  "authoring/v1": {
    family: "authoring",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/authoring/v1/openapi.json",
    portalRoute: "/api-reference/authoring/v1",
    sdkSupported: false,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "control-plane/v1": {
    family: "control-plane",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/control-plane/v1/openapi.json",
    portalRoute: "/api-reference/control-plane/v1",
    sdkSupported: false,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "delivery/v1": {
    family: "delivery",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/delivery/v1/openapi.json",
    portalRoute: "/api-reference/delivery/v1",
    sdkSupported: true,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "preview/v1": {
    family: "preview",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/preview/v1/openapi.json",
    portalRoute: "/api-reference/preview/v1",
    sdkSupported: true,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "studio/v1": {
    family: "studio",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/studio/v1/openapi.json",
    portalRoute: "/api-reference/studio/v1",
    sdkSupported: false,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "studio-content/v1": {
    family: "studio-content",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/studio-content/v1/openapi.json",
    portalRoute: "/api-reference/studio-content/v1",
    sdkSupported: false,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "tooling/v1": {
    family: "tooling",
    major: "v1",
    kind: "openapi",
    outputPath: "artifacts/tooling/v1/openapi.json",
    portalRoute: "/api-reference/tooling/v1",
    sdkSupported: true,
    deprecatedAt: null,
    sunsetAt: null,
  },
  "webhooks/v1": {
    family: "webhooks",
    major: "v1",
    kind: "json-schema",
    outputPath: "artifacts/webhooks/v1/events.schema.json",
    portalRoute: "/api-reference/webhooks/v1",
    sdkSupported: true,
    deprecatedAt: null,
    sunsetAt: null,
  },
} as const satisfies Readonly<Record<PublicContractRegistryKey, PublicContractMetadataEntry>>;
