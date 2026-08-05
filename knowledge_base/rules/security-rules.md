# Security and Isolation Rules

- Authenticate and authorize every protected operation server-side.
- Default deny when policy information is absent or unknown.
- Include project and environment scope in every relevant query.
- Test cross-workspace, cross-project, cross-environment, cross-collection, cross-entry, cross-field, and cross-locale denial.
- Never rely on UI hiding for authorization.
- Validate unknown input at every external boundary.
- Treat all remote URLs and webhook destinations as untrusted.
- Keep drafts inaccessible to public delivery.
- Use safe secret storage, masking, rotation, and revocation.
- Do not read or reveal `.env`, auth secrets, session history, or credential material in responses or logs.
