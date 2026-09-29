// Browser-safe metadata for the closed public registry. Runtime contract sources remain separate.

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
    baselineDigest: "d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205",
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
    baselineDigest: "3dd7c890b7a0448bfb497db663fadfee7f3eeaf614a026e405da3638a595d59b",
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
    baselineDigest: "ae3daf2c0d9f10cbcd148e634bd7894862fc0ef09402b29fee60264f4e587f0d",
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
    baselineDigest: "58dc4132140956b70a133f6a9437d607f23345e59765afe24ad56f5312d96140",
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
    baselineDigest: "f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03",
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
    baselineDigest: "c9226fdcc767d704a41e100a5440560afbb7f64977209f82d42dad20bc48a9fc",
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
    baselineDigest: "4d30e4e59bee0de0a4fa8fa3a69e612a5f20fa8fea79cf27593b3904e521181a",
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
    baselineDigest: "545b4640f89d707a6cfa254c3f80f93901b68a7cc887333f07d713af38ac6e03",
    deprecatedAt: null,
    sunsetAt: null,
  },
} as const satisfies Readonly<Record<PublicContractRegistryKey, PublicContractMetadataEntry>>;
