// Declares the only public contract sources behind the browser-safe closed registry metadata.

import { authoringOpenApiDocument } from "@framerfordevs/api/contracts/authoring/openapi/index";
import { deliveryOpenApiDocument } from "@framerfordevs/api/contracts/delivery/openapi/index";
import { previewOpenApiDocument } from "@framerfordevs/api/contracts/preview/openapi/index";
import { toolingOpenApiDocument } from "@framerfordevs/api/contracts/tooling/openapi/index";
import { PublicationWebhookEvent } from "@framerfordevs/api/contracts/webhook/index";
import { JSONSchema } from "effect";

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
    ...JSONSchema.make(PublicationWebhookEvent),
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
  "delivery/v1": {
    ...publicContractMetadata["delivery/v1"],
    source: () => deliveryOpenApiDocument,
  },
  "preview/v1": {
    ...publicContractMetadata["preview/v1"],
    source: () => previewOpenApiDocument,
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
