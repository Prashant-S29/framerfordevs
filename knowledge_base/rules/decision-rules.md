# Decision Rules

Every architecture, product, and implementation decision must be evaluated against:

- Product-goal alignment
- Correctness
- Security
- Reliability
- Performance
- UX
- DX
- Observability
- Maintainability and future compatibility

Do not choose convenience alone. Record consequential decisions and their trade-offs in `knowledge_base/context.md` or a dedicated decision record. Ask the developer before decisions that materially change product behavior, public contracts, core dependencies, or architecture.

Decision records are domain references, not mandatory chronological reading. Read a prior decision when current work changes, consumes, or must preserve its contracts, invariants, authority, security model, or trade-offs. Start from current code and tests, use the selective map in `knowledge_base/context.md`, and follow real dependencies to any additional affected decisions. Do not preload unrelated milestone decisions.
