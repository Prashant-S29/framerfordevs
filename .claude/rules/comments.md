---
paths:
  - "apps/**/*.{ts,tsx,js,mjs}"
  - "packages/**/*.{ts,tsx,js,mjs}"
  - "tools/**/*.{ts,tsx,js,mjs}"
  - "scripts/**"
---

# Code comments

Code explains itself through names, types, and small functions. A comment is the exception.

- Write a comment only when a function or file holds long, complex logic that a human reader cannot follow from the code alone. State what it does or why, in one or two sentences.
- A `TODO:` comment is allowed only for specific follow-up work that someone must come back to. Remove it when the work is done.
- Never add comments inside configuration objects, call arguments, or between statements to explain a change, a fix, a ticket, or a milestone. Never write comments that restate the code, record history, or name versions.
- Do not add file headers or doc comments to short or simple files.
- Exception: exported public API in `packages/sdk`, `packages/cli`, and `packages/schema` keeps TSDoc comments for consumers.
- Keep tool directives, such as `@vitest-environment`, `@ts-expect-error`, and lint suppressions.
