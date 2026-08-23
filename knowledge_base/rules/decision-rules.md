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

## Developer decision questions

Before asking the developer to choose:

1. State the exact technical or product decision and why it is required now, including the relevant authority, implementation drift, or constraint.
2. Restate the decision as a short plain-English question that does not require repository-specific knowledge to understand.
3. Present only viable options. Describe what each option changes, its important benefits and costs, and any developer-controlled gate it introduces.
4. Evaluate options against the decision criteria above rather than convenience alone. Identify the recommended option and explain why it best satisfies the governing requirements; do not present materially unequal choices as neutral equivalents.
5. Call out any option that conflicts with an approved decision, creates duplicate authority, weakens fail-closed behavior, or adds migration/release/operational burden.
6. Include a pause/defer option only when deferral is genuinely safe, and state what remains blocked.

When the question is presented through a constrained multiple-choice interface, put both the precise decision and its plain-English restatement in the question text, and put the decision-rule trade-offs in the option descriptions.

Decision records are domain references, not mandatory chronological reading. Read a prior decision when current work changes, consumes, or must preserve its contracts, invariants, authority, security model, or trade-offs. Start from current code and tests, use the selective map in `knowledge_base/context.md`, and follow real dependencies to any additional affected decisions. Do not preload unrelated milestone decisions.
