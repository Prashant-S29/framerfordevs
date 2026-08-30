# `@framerfordevs/sdk`

Framework-independent clients and validation helpers for the Framer for Developers public platform.

> Release status: M13 release staging. No npm publication is performed automatically from this repository.

## Support matrix

| SDK | Delivery | Preview | Authoring | Tooling-generated helpers | Webhook data |
| --- | -------- | ------- | --------- | ------------------------- | ------------ |
| 0.x | v1       | v1      | v1        | v1                        | v1           |

Node.js 22 or newer is supported. Browser-compatible exports use standards-based `fetch`, but credentials must follow the boundaries below.

## Install

```sh
pnpm add @framerfordevs/sdk effect
```

## Delivery

```ts
import { deliveryV1 } from "@framerfordevs/sdk/client";

const delivery = deliveryV1({
  baseUrl: process.env.FFD_API_URL!,
  projectId: "project-id",
  environment: "main",
  token: process.env.FFD_DELIVERY_TOKEN!,
});

const page = await delivery.list("articles", {
  locale: "en-US",
  limit: 25,
});
```

Treat returned cursors as opaque. Keep Delivery credentials in deployment secrets or trusted server boundaries.

## Preview

Preview credentials are explicit, environment-bound, and server-side only:

```ts
import { previewV1 } from "@framerfordevs/sdk/client";

const preview = previewV1({
  baseUrl: process.env.FFD_API_URL!,
  projectId: "project-id",
  environment: "main",
  token: process.env.FFD_PREVIEW_TOKEN!,
});
```

Never include Preview credentials in browser bundles or URL query strings. Preview responses are no-store.

## Authoring

Authoring clients require an explicit OAuth access token or management credential and are intended for trusted Node.js processes only:

```ts
import { authoringV1 } from "@framerfordevs/sdk/authoring";

const authoring = authoringV1({
  baseUrl: process.env.FFD_API_URL!,
  projectId: "project-id",
  environmentId: "environment-id",
  token: process.env.FFD_MANAGEMENT_TOKEN!,
});

const form = await authoring.form.get("articles");
const currentPresentation = await authoring.presentation.get("articles");

const page = await authoring.entries.list("articles", "en-US", { limit: 20 });
const entry = page.body?.ok ? page.body.data.items[0] : undefined;
if (entry) {
  await authoring.entries.rename("articles", "en-US", entry.id, {
    displayName: "Launch post",
    expectedNameVersion: entry.nameVersion,
  });
}
```

The compiled [`examples/authoring.ts`](./examples/authoring.ts) file provides a complete environment-backed automation example.

The Promise and Effect clients reject redirects, bound request/response bytes and timeouts, runtime-validate operation-specific requests, recursively decode exact Authoring responses/errors, keep bearer authority in headers, and expose read-only Presentation/form metadata plus optimistic exact-locale entry, draft, and content-publication operations. Safe helpers fetch current draft authority before saving, validate then publish from the exact returned authority, reject repeated pagination cursors, and process bounded imports with explicit concurrency and per-entry outcomes. Schema export/plan/push and Presentation mutation belong to the CLI, not this application SDK. The clients never force overwrite or hide conflicts. Never use Authoring credentials in browser code.

## Effect schemas

Exact public transport schemas and immutable-revision recognition helpers are available from:

```ts
import { DeliveryItem, recognizeDeliveryContract } from "@framerfordevs/sdk/effect";
```

Generated clients distinguish recognized contracts from unrecognized immutable revisions instead of silently applying a stale validator.

## Webhooks

Verify the exact raw request bytes before parsing JSON:

```ts
import { verifyWebhookRequest } from "@framerfordevs/sdk/webhooks";

const result = await verifyWebhookRequest({
  webhookId,
  webhookTimestamp,
  webhookSignature,
  body: rawBody,
  secrets,
  nowEpochSeconds: Math.floor(Date.now() / 1_000),
  reserveEventId,
});
```

Reserve event IDs before side effects, support only bounded secret-rotation overlap, and make handlers idempotent. Invalidation normalization is exported from `@framerfordevs/sdk/invalidation`.

## Exports

- `@framerfordevs/sdk`
- `@framerfordevs/sdk/client`
- `@framerfordevs/sdk/effect`
- `@framerfordevs/sdk/authoring`
- `@framerfordevs/sdk/webhooks`
- `@framerfordevs/sdk/invalidation`

## Security

Treat API responses, content, cursors, webhook bodies, and URLs as untrusted. Keep response bounds, request timeouts, and redirect rejection enabled. Never log credentials or raw content payloads.

## License

MIT
