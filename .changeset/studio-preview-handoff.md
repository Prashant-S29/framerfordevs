---
"@framerfordevs/sdk": minor
"@framerfordevs/cli": minor
---

Add Studio Preview handoff. The SDK adds `previewHandoffV1({ baseUrl }).read(token)`, which reads the entry that a five-minute `ffd_pvh_` handoff token binds, from `GET /api/preview/v1/handoff`. The CLI adds `ffd preview target get|set|clear` to set the Preview URL of an environment, and `ffd entry preview` to issue a handoff token for the current draft or one revision. Preview v1 now rejects browser Origin and preflight requests.
