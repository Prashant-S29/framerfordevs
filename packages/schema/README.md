# `@framerfordevs/schema`

Dependency-free declarative schema contracts and validation for Framer for Developers code-first authoring.

> Release status: M13 release staging. No npm publication is performed automatically from this repository.

## Install

```sh
pnpm add -D @framerfordevs/schema
```

## Define a schema

```ts
import type { CollectionSchema, ProjectSchema } from "@framerfordevs/schema";

const posts = {
  sourceKey: "posts",
  apiKey: "posts",
  fields: [
    {
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { maxLength: 160 },
    },
  ],
} as const satisfies CollectionSchema;

export default {
  collections: [posts],
} as const satisfies ProjectSchema;
```

The complete [`examples/framerfordevs.schema.ts`](./examples/framerfordevs.schema.ts) file is compiled by the package type-check.

Tier 1 accepts only the documented closed declarative TypeScript grammar. These contracts do not make calls, functions, loops, spread, computed properties, runtime imports, or arbitrary modules executable. The CLI statically extracts and validates the data without loading the schema module.

## Validate untrusted documents

`@framerfordevs/schema/validate` exports the dependency-free `validateProjectSchema` result API and `isProjectSchema` type guard. Both enforce the same complete kind-correlated contract used by Tier 1, Tier 2, and server-side Authoring kernels.

```ts
import { validateProjectSchema } from "@framerfordevs/schema/validate";

const result = validateProjectSchema(untrustedValue);
if (!result.valid) console.error(result.issues);
```

## Experimental composition

`@framerfordevs/schema/compose` exports pure `defineField`, `defineCollection`, and `defineSchema` identity helpers for the explicitly opted-in experimental Tier 2 builder. It restores local functions, loops, mapping, and spread inside a credential-blind QuickJS worker. It does not allow npm packages, Node built-ins, dynamic imports, loaders, filesystem, environment, clock, randomness, or network capabilities.

Tier 2 remains experimental/default-off because the prebuilt QuickJS 0.32.0 growing-memory WASM cannot enforce a hard guest-memory ceiling (`justjake/quickjs-emscripten#255`). That issue blocks only production/default enablement and hard-memory proof, not other M13 functionality.
