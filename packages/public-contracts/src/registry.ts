import { authoringOpenApiDocument } from "@framerfordevs/api/contracts/authoring/openapi";
import { controlPlaneOpenApiDocument } from "@framerfordevs/api/contracts/control-plane/openapi";
import { deliveryOpenApiDocument } from "@framerfordevs/api/contracts/delivery/openapi";
import { previewOpenApiDocument } from "@framerfordevs/api/contracts/preview/openapi";
import { studioContentOpenApiDocument } from "@framerfordevs/api/contracts/studio-content/openapi";
import { studioOpenApiDocument } from "@framerfordevs/api/contracts/studio/openapi";
import { toolingOpenApiDocument } from "@framerfordevs/api/contracts/tooling/openapi";
import { PublicationWebhookEvent } from "@framerfordevs/api/contracts/webhook";
import { make as makeJsonSchema } from "@framerfordevs/api/contracts/response/json-schema";

import {
  publicContractMetadata,
  type PublicContractMetadataEntry,
  type PublicContractRegistryKey,
} from "./metadata";

export * from "./metadata";

export interface PublicContractRegistryEntry extends PublicContractMetadataEntry {
  readonly source: () => unknown;
}

function webhookEventSchema(): unknown {
  return {
    ...makeJsonSchema(PublicationWebhookEvent),
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://developers.framerfordevs.example/specs/webhooks/v1/events.schema.json",
    title: "Framer for Developers publication webhook event",
    "x-webhook-protocol": {
      rawBodyRequired: true,
      signatureScheme: "Standard Webhooks compatible HMAC-SHA256",
      headers: {
        id: "webhook-id",
        timestamp: "webhook-timestamp",
        signature: "webhook-signature",
      },
      toleranceSeconds: 300,
      maximumOverlappingSignatures: 2,
    },
  };
}

export const publicContractRegistry = {
  "authoring/v1": {
    ...publicContractMetadata["authoring/v1"],
    source: () => authoringOpenApiDocument,
  },
  "control-plane/v1": {
    ...publicContractMetadata["control-plane/v1"],
    source: () => controlPlaneOpenApiDocument,
  },
  "delivery/v1": {
    ...publicContractMetadata["delivery/v1"],
    source: () => deliveryOpenApiDocument,
  },
  "preview/v1": {
    ...publicContractMetadata["preview/v1"],
    source: () => previewOpenApiDocument,
  },
  "studio/v1": {
    ...publicContractMetadata["studio/v1"],
    source: () => studioOpenApiDocument,
  },
  "studio-content/v1": {
    ...publicContractMetadata["studio-content/v1"],
    source: () => studioContentOpenApiDocument,
  },
  "tooling/v1": {
    ...publicContractMetadata["tooling/v1"],
    source: () => toolingOpenApiDocument,
  },
  "webhooks/v1": {
    ...publicContractMetadata["webhooks/v1"],
    source: webhookEventSchema,
  },
} as const satisfies Readonly<Record<PublicContractRegistryKey, PublicContractRegistryEntry>>;
