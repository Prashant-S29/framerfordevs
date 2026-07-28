# Product Vision

## Working name

**Framer for Devs**

## Product definition

Framer for Devs is a backend-agnostic visual frontend platform that lets developers, designers, marketers, and clients collaboratively build, manage, render, and operate production websites.

The platform separates frontend authoring from frontend ownership. It removes the repeated work involved in building content-management panels, client editing tools, SEO interfaces, preview systems, localization workflows, and deployment pipelines, while preserving developer control over rendering, code, infrastructure, and integrations.

The product is not a single-purpose CMS, website builder, or hosting service. It is a common project platform made of capabilities that can be enabled progressively.

## Vision

> Build the frontend experience once, define what is editable, and give developers and clients a complete system for operating the website without rebuilding a custom CMS and editing workflow for every project.

The long-term goal is to make frontend development visual, structured, collaborative, portable, and backend-independent without removing professional developer control.

## Problem

Modern website development is fragmented:

- Visual builders make page creation easy but often limit runtime, backend, code ownership, and portability.
- Headless CMS products manage structured content but leave the complete frontend implementation to developers.
- Web frameworks provide rendering flexibility but require developers to repeatedly build content editing, permissions, preview, localization, SEO, and client handover systems.
- Clients need to update content and selected UI elements without touching application code or breaking the site.
- Developers need flexibility over rendering, deployment, components, caching, integrations, and infrastructure.

Framer for Devs combines these concerns around one structured project model.

## Core product model

A project is a common container, not a permanent project type.

```text
Workspace
└── Project
    ├── Content
    ├── Sites
    ├── Data sources
    ├── Deployments
    ├── Environments
    ├── Members
    ├── Policies
    └── Project settings
```

A project may begin with only the CMS capability and later gain visual sites, managed hosting, and backend integrations without conversion, duplication, or migration.

## Product capabilities

### 1. Headless CMS

Developers define structured content schemas, invite clients, and consume published content through JSON APIs and generated developer tooling.

The CMS provides:

- Structured content models
- Draft and published content
- Revisions and auditability
- Localization
- Permissions
- Client-friendly editing
- Delivery APIs
- Preview APIs
- Generated schemas, types, validators, and clients
- Reliable publication events and update signals

### 2. Visual website builder

Developers and designers visually create pages and bind components to CMS content.

The visual layer stores structured presentation data rather than generated HTML:

- Pages and routes
- Component trees
- Styles and responsive rules
- Design tokens
- Content bindings
- Navigation
- SEO configuration
- Reusable components
- Custom developer-owned components

Existing CMS collections become data sources for the visual layer. No content migration is required.

### 3. Managed publishing and hosting

Users can publish visually built websites through the platform.

The managed layer handles:

- Preview builds
- Static output
- Production publishing
- Asset delivery
- Rollbacks
- Cache invalidation
- Domain and environment management
- Deployment history

Developers may instead keep deployment ownership.

### 4. Backend integration layer

The visual frontend can connect to external systems and become a complete application layer.

Future data-source providers may include:

- Internal CMS
- REST APIs
- GraphQL APIs
- Authentication systems
- Databases through secure adapters
- Server functions
- External CMS products
- Business services

The internal CMS is the first built-in data-source provider.

## Delivery modes

The same project can be consumed in multiple ways.

### CMS-only

The developer uses the content APIs and renders the website in their own codebase.

### Visual site with developer-controlled rendering

The site is visually authored, while a renderer SDK or framework adapter renders it inside the developer's application and infrastructure.

### Fully managed website

The site is visually authored, built, deployed, and served by the platform.

## Canonical project representation

The platform stores structured resources, not only generated HTML.

The canonical model includes:

- Content schemas
- Content entries
- Published revisions
- Pages
- Component nodes
- Data bindings
- Design tokens
- Routes
- Locales
- SEO
- Permissions
- Assets
- Environments
- Deployments

This representation is framework-independent. Supported renderers and adapters transform it into concrete runtime output.

## Ownership model

### The platform owns

- Visual editing
- Content management
- Content schemas
- Client editing interfaces
- Localization workflows
- SEO management
- Permissions
- Drafts, revisions, and publishing
- Page definitions
- Data-binding definitions
- Preview workflows

### Developers may own

- Application code
- Custom components
- Rendering strategy
- Framework
- Deployment
- Infrastructure
- Caching
- Authentication integration
- Analytics
- Business logic
- External integrations

### The platform may additionally own

When managed hosting is enabled:

- Builds
- Hosting
- CDN delivery
- Preview deployments
- Rollbacks
- Runtime upgrades
- Cache invalidation

## Product principles

1. Projects contain optional capabilities; they do not have permanent types.
2. CMS content is a shared project resource, independent of the visual editor.
3. Presentation and content are stored separately.
4. Visual pages reference CMS resources using stable identifiers.
5. Developers retain ownership of code and infrastructure when desired.
6. Client editing is safe, permissioned, and intentionally constrained.
7. Generated output is not the primary source of truth.
8. Framework independence is achieved through supported renderers and adapters, not by promising universal rendering without runtime support.
9. Self-hosting is a deployment model, not a separate product type.
10. UX for clients and DX for developers are equally important.
11. Performance and predictable delivery are core product requirements.
12. Every capability must be designed to compose with future capabilities.

## Primary users

### Developers

Define schemas, integrations, components, rendering behavior, permissions, and deployment boundaries.

### Designers

Compose responsive interfaces, reusable sections, styles, and design systems.

### Content teams and marketers

Manage structured content, localization, SEO, publishing, and website operations.

### Clients

Edit approved content and presentation properties without accessing critical implementation details.

### Agencies and teams

Build reusable systems, hand projects over safely, and operate many client websites consistently.

## Initial product direction

The CMS is the first product layer because every later capability depends on structured content, stable project resources, publishing, permissions, and delivery.

The first release should prove that a developer can:

1. Create a project.
2. Define content schemas.
3. Invite a client.
4. Let the client manage content through generated interfaces.
5. Consume fast, predictable, published JSON.
6. receive reliable update events.
7. Generate strongly typed developer tooling.
8. Add visual sites later without migrating the project.

## Long-term outcome

Framer for Devs becomes a universal presentation and website operations layer between backend systems and end users.

Developers define the architecture and boundaries once. Designers and clients can then visually create, manage, and operate the website within those boundaries.
