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

export const publicContractMajors = ["v1", "v2"] as const;
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
  readonly baselinePath: string;
  readonly baselineDigest: string;
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
  "studio-content/v2",
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
    baselinePath: "baselines/authoring/v1/openapi.json",
    baselineDigest: "fe9876d93d76f893bf40a0f4f7d5e7dee9725ccb4481bdaef1ceca8f5a8c6610",
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
    baselinePath: "baselines/control-plane/v1/openapi.json",
    baselineDigest: "d151581190e0532300c9dd05787ea054227e9c24a46eaaefb91a11151ef0e3d5",
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
    baselinePath: "baselines/delivery/v1/openapi.json",
    baselineDigest: "120877f08feb4789c64c35060da71eaf9414ce3d612de7fa09821001e5e30711",
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
    baselinePath: "baselines/preview/v1/openapi.json",
    baselineDigest: "0af7a39361ea894389fcb00248000d7ebdd21f5b10783c995339163df39ded42",
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
    baselinePath: "baselines/studio/v1/openapi.json",
    baselineDigest: "35913414f519316097cea6e73dfb1cb3a8e9097bb9083a76543adff25c6eed8f",
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
    baselinePath: "baselines/studio-content/v1/openapi.json",
    baselineDigest: "f0166c8346c4e0771ed5f97570c08302dd3bd94e0b0ff566cfd41a6654f6afe0",
    deprecatedAt: null,
    sunsetAt: null,
  },
  "studio-content/v2": {
    family: "studio-content",
    major: "v2",
    kind: "openapi",
    outputPath: "artifacts/studio-content/v2/openapi.json",
    portalRoute: "/api-reference/studio-content/v2",
    sdkSupported: false,
    baselinePath: "baselines/studio-content/v2/openapi.json",
    baselineDigest: "86254dbe1c815f3a027d89241be5b697c9ed95b2e1767cf828571a39d4a71d94",
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
    baselinePath: "baselines/tooling/v1/openapi.json",
    baselineDigest: "e11a3b87226c189d58109f581344ad0cdb710d39bc87000b85360c1423795110",
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
    baselinePath: "baselines/webhooks/v1/events.schema.json",
    baselineDigest: "05fe4b3e43b3564483ddbc9d4fd001b79701c715771f3b019a986074b6868a06",
    deprecatedAt: null,
    sunsetAt: null,
  },
} as const satisfies Readonly<Record<PublicContractRegistryKey, PublicContractMetadataEntry>>;
