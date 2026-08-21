# Webhook signing secrets

Create one ignored `<scenario>.txt` file for each configured Framer for Devs endpoint. Put the active secret on the first line. During rotation overlap, put the retiring secret on the second line. No file may contain more than two non-empty lines.

Supported names:

- `success.txt`
- `retry-twice.txt`
- `rate-limit-once.txt`
- `permanent-failure.txt`
- `redirect.txt`
- `slow.txt`
- `idempotent.txt`

Use mode `600`. Never paste these values into logs, reports, source files, or issue trackers.
