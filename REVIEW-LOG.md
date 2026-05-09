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

## Review [2026-05-09 18:17] — after TASK-014 through TASK-018
- Success streak: 5
- Patterns identified: 3
  - Roadmap `workspaces:` field is hint-only; task description body is canonical (TASK-016 spilled apps/web → apps/server)
  - Pure-TS view-derivation modules pattern across React + Phaser components (TASK-016, TASK-017, TASK-018 — `*.ts` + `*.test.ts` companion to JSX/scene)
  - Phaser scene state via `game.registry` set in `Phaser.Game` preBoot (TASK-017 — auto-started scenes can't take init data)
- Proposals drafted: 3
- Proposals de-duplicated: 0 (3 survived; references = current CLAUDE.md + approvals/history.md + last review PRs #10/#17 bodies)
- Refinements committed: 3
- PR: https://github.com/g-chappell/pirate-battle/pull/23
- Outcome: opened
- Files touched: CLAUDE.md (Tier 2 Project conventions, Tier 3 Architecture notes, Tier 3 Testing patterns)

---

## Review [2026-05-09 23:16] — after TASK-020 through TASK-025
- Success streak: 5
- Patterns identified: 1
  - External-boundary `Interface` + `InMemory*` + production-impl pattern recurring across stores and adapters (TASK-023 abstracted `WalletAuthVerifier` so route tests inject a stub avoiding WASM cold-start; TASK-025 explicitly cited matching the wallet-auth/nonce-store split when introducing `BlockfrostClient` + `NftSnapshotStore`).
- Proposals drafted: 1
- Proposals de-duplicated: 0 (1 survived; references = current CLAUDE.md + last review PRs #17/#23 bodies)
- Refinements committed: 1
- PR: <pending>
- Outcome: opened
- Files touched: CLAUDE.md (Tier 3 Architecture notes)
