# Structured Code Comment Rules

These rules apply incrementally to every new or materially modified hand-authored source file. Do not perform noisy repository-wide comment churn unless the developer explicitly requests it.

## Scope and exclusions

- Apply these rules to application code, libraries, tests, scripts, and hand-authored configuration formats that support comments.
- Do not add comments to generated code, migration snapshots, generated migration SQL, vendored or third-party code, lockfiles, JSON, registry snapshots, or other machine-owned artifacts.
- Preserve required shebangs, license notices, directives, and generated-file markers in their syntactically required positions.

## File responsibility header

- Put a concise file-level comment at the top of every covered file, before imports when syntax permits.
- Describe the file's responsibilities and boundaries: what it owns, coordinates, validates, exposes, or deliberately does not own.
- Summarize the major things the file does without documenting every symbol or repeating the filename.
- Keep the header current when the file's responsibilities change.

## Function comments outside frontend and UI code

- Put a concise documentation comment directly above every authored function declaration, function expression, arrow function, class or object method, callback, test function, and lifecycle hook.
- Explain the function's purpose in domain terms. Include important inputs, outputs, side effects, authorization or transaction boundaries, invariants, or failure behavior only when they are meaningful.
- Do not merely translate the function name or restate its TypeScript signature.
- One comment may document a TypeScript overload set or tightly coupled generated wrapper declarations when they represent one function contract.
- Prefer extracting a named helper when a non-trivial anonymous callback cannot be documented clearly.

## Inline comments outside frontend and UI code

- Add inline comments only where they explain non-obvious intent, workflow ordering, invariants, security constraints, concurrency behavior, compatibility workarounds, or why an apparently simpler approach is unsafe.
- Place workflow comments at phase boundaries rather than narrating each statement.
- Do not use comments to compensate for unclear naming or unnecessarily complex code; improve the code first.
- Remove or update stale, redundant, commented-out, TODO-without-owner, and implementation-narration comments.

## Frontend and UI exception

- Frontend and UI files receive the file responsibility header only.
- Do not add function-level or inline implementation comments inside frontend or UI code.
- Express necessary frontend rationale through the file header, clear names, small components and hooks, explicit types, and focused tests.
- This exception covers browser-facing routes, components, hooks, client state, styles, and frontend utilities. Shared server/domain modules continue to follow the function-comment rules.

## Comment quality gate

A useful comment explains responsibility, intent, constraints, or workflow that the code alone does not communicate reliably. Comments must remain concise, accurate, and free of secrets, sensitive payloads, stale history, and speculative claims.

Code review must reject comments that only repeat syntax, drift from behavior, expose sensitive information, or add visual noise without improving understanding.
