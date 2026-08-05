# Source-of-Truth Rules

When documents conflict, use this authority order:

1. Explicit current user instruction
2. `knowledge_base/product.md` for product vision
3. `knowledge_base/prd/cms.md` for CMS behavior and contracts
4. `knowledge_base/rules/index.md` and every rule it links for execution constraints
5. `knowledge_base/milestone.md` for implementation order and acceptance tests
6. `knowledge_base/progress.md` and `knowledge_base/context.md` for current state
7. Existing code

Git remains authoritative for repository and commit state. Stop and ask the developer when a conflict cannot be resolved safely.
