# Webhook receiver harness

- This is a developer-only external-consumer harness, not a production application or deployment target.
- Keep its event validator implementation-independent: do not import internal API contracts solely to make compatibility tests pass.
- Use the root pnpm workspace and add dependencies to this package through pnpm filtering.
- Never commit `.env`, tunnel credentials, webhook signing secrets, or captured requests.
- Never print signing secrets, signatures, Cloudflare tokens, or complete captured event bodies.
- Preserve raw request bytes until signature verification completes.
- Keep scenarios deterministic and store one immutable capture per received attempt.
- Keep live Cloudflare/network tests opt-in; the root readiness gate must remain local and deterministic.
- Run the package checks and build after meaningful changes.
