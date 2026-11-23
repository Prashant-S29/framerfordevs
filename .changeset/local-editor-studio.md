---
"@framerfordevs/cli": minor
---

`ffd editor` now serves the Studio workspace at `http://127.0.0.1:<port>/studio`, with search, history, compare, restore, publication, form layout, and Preview. The editor uses your `ffd login`. It no longer accepts `--token-stdin` or `FFD_MANAGEMENT_TOKEN`, and it fails with `CLI_EDITOR_OAUTH_REQUIRED` when `FFD_MANAGEMENT_TOKEN` is set. Sign in again after the upgrade, because the editor needs the new `studio:content` scope. When the local schema differs from the hosted schema, the editor shows the hosted form and pauses saving and publishing until you push.
