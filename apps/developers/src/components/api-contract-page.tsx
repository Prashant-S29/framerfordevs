// Renders canonical OpenAPI contracts as secondary, read-only developer references.

import { createOpenAPIPage } from "fumadocs-openapi/ui";

export const ApiContractPage = createOpenAPIPage({
  playground: {
    enabled: false,
  },
  showResponseSchema: true,
  storageKeyPrefix: "framerfordevs-api-reference-",
});
