---
"@framerfordevs/sdk": minor
"@framerfordevs/cli": minor
---

Add Authoring revision history. The SDK Authoring v1 clients add `entries.listRevisions`, `entries.getRevision`, `entries.compareRevisions`, and `entries.restoreRevision`, decode the `REVISION_INCOMPATIBLE` error, and require the `delivery` read-back on publish and unpublish results. The CLI adds `ffd entry revisions`, `ffd entry revision`, `ffd entry diff` (exit 1 when the revisions differ), `ffd entry restore` (journaled command ID), and `ffd entry validate` (exit 2 when the plan is invalid). `ffd entry publish` and `ffd entry unpublish` print the `delivery` read-back.
