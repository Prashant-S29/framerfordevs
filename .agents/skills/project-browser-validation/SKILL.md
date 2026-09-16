---
name: project-browser-validation
description: Use only when the developer explicitly requests interactive Playwright browser validation, visual review, screenshots, or debugging of a failing browser test in this repository. Do not use for ordinary implementation or validation; run the committed noninteractive browser suite instead.
---

# Project browser validation

## Permission boundary

Interactive browser automation is opt-in. Before running `playwright-cli`, attaching to a browser, using headed/UI/debug mode, taking screenshots, recording video, or performing a manual browser tour, confirm that the developer explicitly requested that activity in the current conversation.

For ordinary validation, do not load an interactive browser session. Run the committed assertion-based suite:

```bash
pnpm test:browser
```

The suite is headless, noninteractive, retry-free, and configured not to capture screenshots, traces, or video.

## Interactive command

After explicit authorization, use the repository-pinned CLI rather than a global installation:

```bash
pnpm --filter @framerfordevs/browser-tests exec playwright-cli --help
```

Run sessions from a private temporary working directory so CLI snapshots and transient state never enter the repository. Use ephemeral profiles, close every session, clear the clipboard when it carried sensitive data, and scan/remove artifacts containing invitation fragments or other one-time proofs.

## Boundaries

- Never place passwords, invitation proofs, bearer tokens, cookies, or session state in command arguments, exported environment variables, screenshots, traces, videos, logs, or retained artifacts.
- Do not target non-loopback origins unless the developer explicitly authorizes the exact environment.
- Prefer role, label, and text locators plus web-first assertions; do not rely on CSS implementation details.
- Do not add retries to hide failures.
- Do not perform visual comparison or breakpoint tours unless explicitly requested.
- Convert durable browser regressions into isolated committed tests under `tools/browser-tests/test/integration/`.
