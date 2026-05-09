# Review Log

Self-improvement review entries. Written by `autonomous-review` every N
consecutive successes. Separate from `AGENT-LOG.md` so the run log stays
gap-free.

## Format

```
---

## Review [YYYY-MM-DD HH:MM] — after TASK-XXX through TASK-YYY
- Success streak: N
- Patterns identified: <bulleted list>
- Proposals written to: .claude/approvals/PENDING.md
- Proposals count: N (before de-dup: M)
- De-duplicated via: CLAUDE.md + approvals/history.md
- Status: pending-approval | approved | rejected | mixed
- Approved at: <ISO timestamp or n/a>
```

---

## Review History

---

## Review [2026-05-08 15:08] — after TASK-001+002 through TASK-008
- Success streak: 5
- Patterns identified:
  - Vitest `--passWithNoTests` for scaffold workspaces (TASK-003)
  - 3-file tsconfig split for Vite+React workspaces (TASK-004)
  - `@@unique` already creates a btree; don't pair with `@@index` (TASK-008)
  - Use throwaway pg container for `prisma migrate dev`, not the deployed DB (TASK-008)
- Proposals written to: .claude/approvals/PENDING.md
- Proposals count: 4 (before de-dup: 4)
- De-duplicated via: CLAUDE.md + approvals/history.md
- Status: pending-approval
- Approved at: n/a

---

## Review [2026-05-09 13:18] — after TASK-009 through TASK-013
- Success streak: 5
- Patterns identified: 4
- Proposals drafted: 4
- Proposals de-duplicated: 0 (4 survived)
- Refinements committed: 4
- PR: https://github.com/g-chappell/pirate-battle/pull/17
- Outcome: opened
- Files touched: CLAUDE.md
- Refinements:
  - codify per-workspace vitest setup recipe (Tier 3)
  - separate engine determinism vs non-determinism test idioms (Tier 3)
  - lore-canon [DRAFT] fallback when lore/OTK.md is absent (Tier 2)
  - correct stale /autonomous-approve reference (Autonomous workflow)
