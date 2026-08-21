# framerfordevs

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Express, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Express** - Fast, unopinionated web framework
- **Effect** - Typed application workflows, errors, services, Layers, and runtime lifecycle
- **OpenTelemetry** - Vendor-neutral tracing and metrics with safe local defaults
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Node.js** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

- Liveness: `GET http://localhost:3000/`
- Readiness: `GET http://localhost:3000/ready`

Set `OTEL_EXPORTER_OTLP_ENDPOINT` in `apps/server/.env` to enable OTLP/HTTP trace and metric export. When it is omitted, development prints bounded trace summaries locally, while production performs no network telemetry export.

## Webhook test receiver

`tools/webhook-test-receiver` is a private developer harness for exercising signed publication webhooks, retries, timeouts, redirects, replay, idempotency, secret overlap, and optional named Cloudflare Tunnel delivery. Its deterministic tests run in the root readiness gate, but the receiver and tunnel are never part of the production deployment manifests.

See [`tools/webhook-test-receiver/README.md`](tools/webhook-test-receiver/README.md) for local, Docker, and opt-in public-tunnel usage. Never commit its signing secrets, Cloudflare credentials, or captures.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@framerfordevs/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: pnpm run docker:build
- Start: pnpm run docker:up
- Logs: pnpm run docker:logs
- Stop: pnpm run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Git Hooks and Formatting

- Run checks: `pnpm run check`
- Run the complete review gate: `pnpm run ready`

## Project Structure

```
framerfordevs/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Start)
│   ├── server/      # Backend API (Express, ORPC)
│   └── worker/      # Dedicated publication webhook worker
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
└── tools/
    └── webhook-test-receiver/ # Developer-only external receiver harness
```

Each workspace owns its source, tests, dependencies, configuration, and Turbo tasks. Focused unit/component tests stay beside their single source owner as `src/**/*.test.*`; database, HTTP, filesystem, and multi-module tests live under `test/integration/`; independent protocol tests use `test/contract/`; broad accessibility suites use `test/accessibility/`; and workspace-local fixtures/helpers use `test/support/`. Cross-workspace system or performance suites belong in private `tools/*` workspaces rather than an anonymous root test directory.

See [`knowledge_base/decisions/repository-test-structure.md`](knowledge_base/decisions/repository-test-structure.md) for the complete placement and boundary rules.

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run test`: Run all automated tests
- `pnpm run test:unit`: Run focused unit/component tests
- `pnpm run test:integration`: Run workspace integration suites (stop external workers sharing the database first)
- `pnpm run test:contract`: Run independent protocol contract suites
- `pnpm run test:accessibility`: Run broad accessibility suites
- `pnpm run test:coverage`: Run tests with coverage
- `pnpm run ready`: Format, lint, type-check, test, collect coverage, and build
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
- `pnpm run check`: Run Biome formatting and linting
- `pnpm run docker:build`: Build the Docker Compose images
- `pnpm run docker:up`: Build and start the Docker Compose stack
- `pnpm run docker:logs`: Tail logs from the Docker Compose stack
- `pnpm run docker:down`: Stop the Docker Compose stack
