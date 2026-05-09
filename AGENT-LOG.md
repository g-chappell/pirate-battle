# Agent Log

Append-only run log for the autonomous dev agent. Every run writes one entry
here, regardless of outcome. Review cycles write a separate `REVIEW-LOG.md`
entry AND flag this entry with `review_proposed: true` — so the log never has
gaps.

## Format

```
---

### Run [YYYY-MM-DD HH:MM]
- Task: TASK-XXX — <title> (or "N/A — no tasks available")
- Outcome: success | blocked | skipped | success_with_warning
- PR: <URL or N/A>
- Test counts: <workspace counts>
- Files changed: <list>
- Regression alert: true | false
- Review proposed: true | false
- Deploy: success | failed | n/a
- Lessons learned: <free text>
- Notes: <optional>
```

---

## Run History

---

### Run [2026-05-08 11:25]
- Task: TASK-001 + TASK-002 — Init root package.json + npm workspaces + tsconfig.base.json (bundled with packages/* scaffold)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/4
- Test counts: core=0, content=0, shared=0, db=0
- Files changed: 18 (root scaffold + 4 packages × {package.json, tsconfig.json, src/index.ts})
- Regression alert: false (first cycle; no prior counts to compare)
- Review proposed: false (success streak 1; threshold 5)
- Deploy: deferred — Dockerfile COPYs apps/server/package.json + apps/web/package.json (lines 12-13), neither directory exists until TASK-003 / TASK-004. `bash scripts/deploy.sh` exits 1 cleanly at build step; no containers started, nothing to roll back. Task NOT marked blocked — implementation is correct, deploy infra is just ahead of source. Re-attempts when TASK-003 (apps/server scaffold) lands.
- Lessons learned: TASK-001 cannot validate in isolation — `tsc -b` errors on empty references (TS18002) and `npm test --workspaces` errors when workspace globs match no packages. Bundled with TASK-002 (4 packages stubs) into one PR. STORY-01 will benefit from this fix to its task dep graph: future "scaffold" tasks should avoid the empty-reference / empty-glob trap.

---

### Run [2026-05-08 12:09]
- Task: TASK-003 — Scaffold apps/server (Fastify) with /health endpoint
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/6
- Test counts: server=0 (vitest run --passWithNoTests; no test files yet)
- Files changed: 6 (apps/server/{package.json, tsconfig.json, src/index.ts}; root package.json, tsconfig.json, package-lock.json)
- Regression alert: false
- Review proposed: false (success streak 2; threshold 5)
- Deploy: deferred — Dockerfile still COPYs `apps/web/package.json` (line 13); `apps/web/` doesn't exist until TASK-004. `bash scripts/deploy.sh` exits 1 at build step; no containers started, nothing to roll back. Task NOT marked blocked — implementation is correct, deploy infra is one task ahead of source. Re-attempts when TASK-004 (apps/web scaffold) lands.
- Lessons learned:
  - Adding apps/* to root workspaces was a one-line change but required at TASK-003 since TASK-001 only included packages/* (apps/ directory didn't exist yet).
  - Vitest 4 exits 1 on "no test files" without --passWithNoTests; future scaffold tasks that pre-include vitest should use the flag (or commit a single placeholder test) so first-run CI is green.
  - Fastify 5 + tsx 4 + @types/node ^20 typecheck cleanly under composite NodeNext + verbatimModuleSyntax with zero extra config.

---

### Run [2026-05-08 13:06]
- Task: TASK-004 — Scaffold apps/web (Vite + React) with placeholder route
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/7
- Test counts: server=0, web=0
- Files changed: apps/web/package.json, apps/web/tsconfig.json, apps/web/tsconfig.app.json, apps/web/tsconfig.node.json, apps/web/vite.config.ts, apps/web/index.html, apps/web/src/main.tsx, apps/web/src/App.tsx, tsconfig.json, .gitignore, package-lock.json
- Regression alert: false
- Review proposed: false
- Deploy: success (image pirate-battle:latest, container pirate-battle-app-1, health http://localhost:3001/health → 200 {"ok":true})
- Lessons learned: composite + noEmit don't compose; split tsconfig.json into solution + tsconfig.app.json (src) + tsconfig.node.json (vite.config) so app config can use bundler resolution + DOM types without pulling node types into React source.

---

### Run [2026-05-08 14:07]
- Task: TASK-007 — Prisma schema: users, captains, crews, moves, items
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/8
- Test counts: server=0, web=0
- Files changed: .gitignore, package-lock.json, packages/db/package.json, packages/db/prisma/schema.prisma, packages/db/prisma/seed.ts
- Regression alert: false
- Review proposed: false
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2)
- Lessons learned: Prisma 6 emits a deprecation warn for `package.json#prisma` (migrate to prisma.config.ts in Prisma 7). Schema validates + generates without DATABASE_URL; migration deferred to TASK-008.

---

### Run [2026-05-08 15:06]
- Task: TASK-008 — Prisma schema: battles + battle_events + initial migration
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/9
- Test counts: server=0, web=0
- Files changed: packages/db/prisma/schema.prisma, packages/db/prisma/migrations/migration_lock.toml, packages/db/prisma/migrations/20260508150458_init/migration.sql, packages/db/src/index.ts
- Regression alert: false
- Review proposed: true
- Deploy: success (image pirate-battle:latest, container pirate-battle-app-1 recreated, /health 200 on attempt 2)
- Lessons learned: prisma migrate dev requires a live DB; spun up a throwaway pg container on 127.0.0.1:55433 to generate the init migration deterministically without touching the deployed pg-1. Removed redundant @@index([battleId, idx]) since @@unique already provides the btree. CI failed on first push because packages/db/generated/ is gitignored — added a `postinstall: prisma generate` to packages/db/package.json so npm ci regenerates the client on fresh checkouts.

---

### Run [2026-05-08 17:09]
- Task: TASK-009 — Engine types + state shape (BattleState, Crew, Move, Action)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/11
- Test counts: server=0, web=0
- Files changed: packages/core/src/types.ts (new), packages/core/src/index.ts (re-exports)
- Regression alert: false
- Review proposed: false (REVIEW-LOG entry from 2026-05-08 15:08 sits within last successThreshold=5 AGENT-LOG entries)
- Deploy: success (health 200, rolling, container recreated)
- Lessons learned: started cycle on stale review branch with dirty AGENT-LOG referencing retired PENDING.md gate; cleaned up by discarding the stale entry and switching to main before Step 3

---

### Run [2026-05-08 18:24]
- Task: TASK-010 — Engine: turn loop + action queue + swap-in + faint
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/12
- Test counts: core=10, server=0, web=0
- Files changed: packages/core/src/engine.ts (new), packages/core/src/engine.test.ts (new), packages/core/src/rng.ts (new), packages/core/src/types.ts, packages/core/src/index.ts, packages/core/package.json, packages/core/tsconfig.json
- Regression alert: false
- Review proposed: false (REVIEW-LOG entry from 2026-05-08 15:08 sits within last successThreshold=5 AGENT-LOG entries; only 2 cycles since last review)
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated)
- Lessons learned: BattleEvent[] log replaces TASK-009's string[] placeholder; damage formula deliberately stubbed as basePower for TASK-011 to refine.

---

### Run [2026-05-09 11:20]
- Task: TASK-011 — Engine: damage formula, accuracy, status effects, type matrix
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/14
- Test counts: core=30, server=0, web=0
- Files changed: packages/core/src/constants.ts, packages/core/src/resolveMove.ts, packages/core/src/resolveMove.test.ts, packages/core/src/engine.ts, packages/core/src/engine.test.ts, packages/core/src/index.ts, packages/core/src/types.ts
- Regression alert: false
- Review proposed: pending Step 15
- Deploy: pending Step 12
- Lessons learned: extending CrewSnapshot with `level` rippled into existing tests' crew helper but no other workspace yet imports CrewSnapshot, so the change was self-contained. Used `constantRng`/`scriptedRng` test helpers instead of relying on seeded RNG byte-equality, which keeps assertions readable and decouples them from any future rng tuning.

---

### Run [2026-05-09 12:25]
- Task: TASK-012 — Engine determinism unit tests (Vitest)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/15
- Test counts: core=34, server=0, web=0
- Files changed: packages/core/src/determinism.test.ts (new), packages/core/vitest.config.ts (new)
- Regression alert: false
- Review proposed: false (REVIEW-LOG entry from 2026-05-08 15:08 still sits within last successThreshold=5 AGENT-LOG entries; only 4 cycles since last review)
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated, rolling strategy)
- Lessons learned: existing engine.test.ts already had a 2-run determinism check; the new file scales it to 100 runs across the four canonical scenarios so any rng-tuning change is caught early. Workspace-level vitest.config.ts makes the include glob explicit so future `**/*.spec.ts` additions don't silently drift.

---

### Run [2026-05-09 13:09]
- Task: TASK-013 — Author 16 base moves (4 per affinity) in packages/content
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/16
- Test counts: core=34, content=8, server=0, web=0
- Files changed: packages/content/src/moves.ts (new), packages/content/src/moves.test.ts (new), packages/content/src/index.ts, packages/content/package.json, packages/content/vitest.config.ts (new), package-lock.json
- Regression alert: false
- Review proposed: true (PR #17 — 4 refinements: vitest workspace recipe, engine non-determinism test idiom, lore [DRAFT] fallback, /autonomous-approve correction)
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated, rolling strategy)
- Lessons learned: First content workspace tests — added vitest devDep + workspace vitest.config.ts mirroring packages/core's setup so npm test --workspaces picks them up. All flavour names left as [DRAFT] since lore/OTK.md does not yet exist in this repo.

---

### Run [2026-05-09 14:07]
- Task: TASK-014 — Author 8 starter crews (2 per faction) with stats + 4 moves each
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/18
- Test counts: core=34, content=17, server=0, web=0
- Files changed: packages/content/src/crews.ts (new), packages/content/src/crews.test.ts (new), packages/content/src/index.ts
- Regression alert: false
- Review proposed: false (PR #17 just merged 2026-05-09 13:17 covering TASK-009→TASK-013; only 1 cycle since last review, far below successThreshold=5)
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated, rolling strategy)
- Lessons learned: defined CrewTemplate type inline in packages/content rather than promoting to packages/core, since the engine does not yet consume crew templates — keeps scope narrow and avoids a cross-workspace edit. Per-affinity stat-spread test (max-min vs balanced/specialist split) catches accidental "two specialists" content drift cheaply.

---

### Run [2026-05-09 15:11]
- Task: TASK-015 — Server: anonymous session create + cookie + GET /me
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/19
- Test counts: core=34, content=17, server=6, web=0
- Files changed: 7 (apps/server/{package.json, src/index.ts, src/userStore.ts, src/routes/session.ts, src/routes/session.test.ts, vitest.config.ts}, package-lock.json)
- Regression alert: false
- Review proposed: false (skipped — review already in trailing-success window via PR #17)
- Deploy: success (pirate-battle.blacksail.dev:3001 — health OK on attempt 2)
- Lessons learned: First test file in apps/server — vitest.config.ts with explicit src/**/*.test.ts include added per CLAUDE.md scaffolding rule. fastify.inject() round-trip on signed cookies needed `headers: { cookie: <raw Set-Cookie value> }`; passing `cookies: { name: value }` to inject double-URL-encodes the @fastify/cookie signature payload and breaks unsignCookie. UserStore DI lets route tests stay Prisma-free, sidestepping the per-worker test-DB infrastructure that doesn't exist yet.

---

### Run [2026-05-09 16:15]
- Task: TASK-016 — Web: starter session bootstrap + team builder UI
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/20
- Test counts: core=34, content=17, server=12, web=5
- Files changed: apps/server/{package.json,tsconfig.json,src/index.ts,src/userStore.ts,src/routes/session.ts,src/routes/captain.ts,src/routes/captain.test.ts}, apps/web/{package.json,tsconfig.app.json,vite.config.ts,vitest.config.ts,src/App.tsx,src/api.ts,src/teamBuilder.ts,src/teamBuilder.test.ts,src/TeamBuilder.tsx}, package-lock.json
- Regression alert: false
- Review proposed: false (PR #17 still in trailing-success window; only 3 cycles since last review, below successThreshold=5)
- Deploy: success
- Lessons learned: Task description authoritative over roadmap workspaces field — TASK-016 was scoped "apps/web" but description required POST /api/captain, which mandated server changes too. Implemented both rather than ship a non-functional UI.

---

### Run [2026-05-09 17:12]
- Task: TASK-017 — Web: install Phaser 3 + scaffold BootScene/BattleScene
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/21
- Test counts: core=34, content=17, server=12, web=17
- Files changed: apps/web/package.json, apps/web/src/phaser/{affinity.ts, affinity.test.ts, BootScene.ts, BattleScene.ts, BattleCanvas.tsx, index.ts}, package-lock.json
- Regression alert: false
- Review proposed: false (PR #17 still in trailing-success window; only 4 cycles since last review, below successThreshold=5)
- Deploy: success (image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated, rolling strategy)
- Lessons learned: Phaser scenes can't take init data when auto-started from the scene[] array, so shared scene state (here: BattleState) goes through the game registry, set in Phaser.Game's preBoot callback. Component is exported but not yet mounted in App.tsx — task brief said "Don't build the move menu yet", so this PR is pure scaffolding; future battle-flow tasks will wire BattleCanvas into the live UI.

---

### Run [2026-05-09 18:09]
- Task: TASK-018 — Web: BattleScene HP bars + move menu + swap UI
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/22
- Test counts: core=34, content=17, web=27, server=12
- Files changed: apps/web/src/api.ts, apps/web/src/battleView.ts, apps/web/src/battleView.test.ts, apps/web/src/BattleView.tsx
- Regression alert: false
- Review proposed: true (PR #23 — 3 refinements: roadmap workspaces hint vs description authority, pure-TS view-derivation modules pattern, Phaser scene state via game.registry preBoot)
- Deploy: success
- Lessons learned: HP bars already shipped with TASK-017 (Phaser rectangles drawn from CrewSnapshot.hp/maxHp); the remaining ask was the React DOM chrome — kept move-menu/swap/turn-log as React DOM panels and isolated their derivations into a pure battleView.ts module so they're trivially Vitest-tested without DOM.

---

### Run [2026-05-09 19:18]
- Task: TASK-020 — Server: AI opponent + battle create/resolve endpoints
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/24
- Test counts: core=42, content=17, server=37, web=27
- Files changed: packages/core/src/{aiPickAction.ts,aiPickAction.test.ts,index.ts}, apps/server/src/{aiTeam.ts,aiTeam.test.ts,crewSnapshot.ts,crewSnapshot.test.ts,battleStore.ts,battleStore.test.ts,index.ts,userStore.ts}, apps/server/src/routes/{battle.ts,battle.test.ts,captain.test.ts,session.test.ts}
- Regression alert: false
- Review proposed: false (PR #23 just merged 2026-05-09 18:17 covering TASK-014→TASK-018; only 1 cycle since last review, below successThreshold=5)
- Deploy: success
- Lessons learned: Prisma-generated client expects `Uint8Array<ArrayBuffer>` for Bytes columns, not `Buffer`/`Uint8Array<ArrayBufferLike>`. Construct via `new ArrayBuffer(n)` + `DataView` to satisfy the type.

---

### Run [2026-05-09 20:11]
- Task: TASK-022 — Web: CIP-30 wallet chooser + connect flow
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/25
- Test counts: core=42, content=17, server=37, web=57
- Files changed: apps/web/src/{App.tsx, WalletChooser.tsx, walletChooser.ts, walletChooser.test.ts}
- Regression alert: false
- Review proposed: false (PR #23 from 2026-05-09 18:17 sits within last successThreshold=5 AGENT-LOG entries; only 2 cycles since last review)
- Deploy: success (pirate-battle.blacksail.dev:3001 — image pirate-battle:latest rebuilt, /health 200 on attempt 2, container pirate-battle-app-1 recreated, rolling strategy)
- Lessons learned: Inlined a BIP-173 bech32 encoder (~50 lines) + minimal CBOR-bytestring parser instead of pulling in the `bech32` runtime dep — keeps the web bundle lean and avoids a network-install dependency mid-cycle. Validated against the BIP-173 empty-data reference vector (`a12uel5l`) plus structural mainnet/testnet HRP checks. CIP-30 reward addresses are CBOR-encoded hex (29 bytes wrapped as `581d…`); header byte's low nibble routes mainnet→`stake`, testnet→`stake_test` HRP.

---

### Run [2026-05-09 21:18]
- Task: TASK-023 — Server: signed-message auth (POST /api/auth/wallet)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/26
- Test counts: core=42, content=17, web=57, server=62
- Files changed: apps/server/package.json, apps/server/src/index.ts, apps/server/src/userStore.ts, apps/server/src/nonceStore.ts (+test), apps/server/src/walletAuth.ts (+test), apps/server/src/routes/auth.ts (+test), package-lock.json
- Regression alert: false
- Review proposed: false (3 successes since last review at 2026-05-09 18:17; threshold 5)
- Deploy: success (image pirate-battle:latest, http://localhost:3001/health → 200, healthcheck attempt 2)
- Lessons learned: @emurgo/cardano-{message-signing,serialization-lib}-nodejs round-trip is straightforward — gen Ed25519 keypair → COSESign1Builder.make_data_to_sign() → prv.sign() → COSESign1.build(sig). Test fixture mints addr+sig+key inside the test, no fixture files needed; same path verifies cleanly. Verifier abstracted behind WalletAuthVerifier interface so route tests inject a stub (avoids loading WASM 7× per route assertion) while a separate suite exercises the real Cardano impl.

---

