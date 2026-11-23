---
"@framerfordevs/cli": minor
---

Add editorial Presentation publication. `ffd login` requests the new `authoring:presentation:publish` OAuth scope, and `ffd presentation publish` requires it. Sign in again to receive the scope. A content administrator can publish labels, help text, placeholders, order, tabs, and groups. The CLI reports `PRESENTATION_ROLE_VISIBILITY_FORBIDDEN` when a publish changes role visibility, and `PRESENTATION_SCOPE_RESTRICTED` when a field is hidden from the signed-in role.
