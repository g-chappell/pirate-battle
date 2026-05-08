---
reviewed_at: 2026-05-08T15:08:00Z
streak: 5
basis_runs:
  - TASK-001+TASK-002
  - TASK-003
  - TASK-004
  - TASK-007
  - TASK-008
approved: false
---

# Pending CLAUDE.md review

After 5 successful tasks (TASK-001 through TASK-008, with TASK-005/006 still
ready), four patterns appeared worth codifying. Each proposal has an
`approved` field — flip to `true` to accept, leave `false` to reject. Save
and run `/autonomous-approve` when done.

## Proposals

### PROP-2026-05-08-01
- section: Testing patterns
- approved: false
- content: |
    Vitest `run` scripts in scaffold-stage workspaces (no test files yet)
    need `--passWithNoTests`. Without it Vitest 4 exits 1 and breaks CI
    before any real tests exist; remove the flag once the first real spec
    lands. Confirmed on TASK-003 (apps/server scaffold).

### PROP-2026-05-08-02
- section: Tech-coupled — TypeScript build
- approved: false
- content: |
    Vite + React workspaces use a 3-file tsconfig split: solution
    `tsconfig.json` (composite, references only), `tsconfig.app.json` for
    `src/**` (DOM lib, bundler resolution, noEmit), and `tsconfig.node.json`
    for `vite.config.ts`. `composite: true` and `noEmit: true` cannot live
    in the same tsconfig — `tsc -b` rejects it. Confirmed on TASK-004
    (apps/web scaffold).

### PROP-2026-05-08-03
- section: Tech-coupled — Prisma
- approved: false
- content: |
    `@@unique([a, b])` already creates a btree index on `(a, b)`; do not
    pair it with `@@index([a, b])` on the same columns. Range scans on the
    leading prefix are served by the unique index for free. Confirmed on
    TASK-008 (BattleEvent replay index).

### PROP-2026-05-08-04
- section: Tech-coupled — Prisma
- approved: false
- content: |
    Generate initial Prisma migrations against a throwaway local Postgres
    (`docker run --rm -p 127.0.0.1:55433:5432 postgres:16-alpine`), not the
    deployed `pirate-battle-db-1` container. `prisma migrate dev` is
    interactive about destructive operations and will block on a running
    app DB; the deployed DB applies migrations later via
    `prisma migrate deploy`. Confirmed on TASK-008.
