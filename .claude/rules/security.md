---
paths:
  - "packages/api/src/**"
  - "packages/auth/src/**"
  - "packages/cli/src/**"
  - "packages/studio-server/src/**"
  - "apps/server/src/**"
  - "apps/dashboard/src/**"
---

# Security and isolation

- Authenticate and authorize every protected operation on the server. Deny by default when policy information is missing.
- Scope every relevant query by workspace, project, and environment. UI hiding is never authorization.
- Test cross-workspace, cross-project, cross-environment, cross-collection, cross-entry, cross-field, and cross-locale denial.
- Validate unknown input at every external boundary. Treat remote URLs and webhook destinations as untrusted.
- Keep drafts unreachable from public Delivery.
- Store secrets safely, mask them, and support rotation and revocation.
- OAuth redirects: plain HTTP is allowed only for exact loopback hosts outside production (`packages/auth/src/redirect-policy`).
