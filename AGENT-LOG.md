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

### Run [2026-05-09 22:18]
- Task: TASK-024 — Web: sign-in flow integration (request nonce → signData → POST)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/27
- Test counts: core=42, content=17, web=80, server=63
- Files changed: apps/server/src/routes/{auth.ts, auth.test.ts}, apps/web/src/{App.tsx, WalletChooser.tsx, api.ts, walletAuth.ts (new), walletAuth.test.ts (new), walletChooser.ts, walletChooser.test.ts}
- Regression alert: false
- Review proposed: false (4 successes since last review at 2026-05-09 18:17; threshold 5)
- Deploy: success (image pirate-battle:latest, http://localhost:3001/health → 200, healthcheck attempt 2, rolling strategy)
- Lessons learned: TASK-023 server contract used the entire signed payload as the nonceStore key — adding a `Nonce: <32-hex>` regex extractor with whole-payload fallback lets the web client sign a human-readable message ("Pirate-Battle sign-in. … Nonce: <hex>") without breaking the existing test fixtures that sign bare nonce strings ("nonce-x", "n", etc). CIP-30 signData expects the address as raw bytes hex, so connectWallet now exposes both rewardAddrHex (CBOR-stripped) and a closure that pre-binds it.

---

### Run [2026-05-09 23:13]
- Task: TASK-025 — Server: Blockfrost client + allow-list config + NFT fetch
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/28
- Test counts: core=42, content=17, web=80, server=85
- Files changed: apps/server/package.json, apps/server/src/cardano/{blockfrost.ts (+test), nftSnapshotStore.ts (+test)}, packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260509221900_nft_snapshot/migration.sql, package-lock.json
- Regression alert: false
- Review proposed: true (PR #29 — 1 refinement: external-boundary Interface + InMemory + production-impl pattern; 5 successes since last review at 2026-05-09 18:09)
- Deploy: success (image pirate-battle:latest, http://localhost:3001/health → 200, healthcheck attempt 2, rolling strategy)
- Lessons learned: Blockfrost asset units concatenate policyId (28-byte hex = 56 chars) + asset_name hex; "lovelace" appears as a length-8 unit and is naturally rejected by the length-then-prefix allow-list filter. Service is split into a `BlockfrostClient` interface (HTTP boundary, mockable) + a `BlockfrostNftService` (cache + filter orchestration) + a `NftSnapshotStore` (in-memory for tests, Prisma for prod) so the entire fetch+cache+freshness path is testable without hitting the network or a database — matches the existing wallet-auth verifier / nonce-store split.

---

### Run [2026-05-10 00:08]
- Task: TASK-026 — Server: GET /api/roster (free starter + NFT crews)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/30
- Test counts: core=42, content=17, web=80, server=90
- Files changed: apps/server/src/index.ts, apps/server/src/routes/roster.ts (new), apps/server/src/routes/roster.test.ts (new)
- Regression alert: false
- Review proposed: false (PR #29 from 2026-05-09 23:16 still open & in trailing-success window; only 1 cycle since last review, below successThreshold=5)
- Deploy: success (image pirate-battle:latest, http://localhost:3001/health → 200, healthcheck attempt 2, rolling strategy)
- Lessons learned: GET /api/roster keeps the contract shape stable across the three population paths (anonymous → starter only; wallet without NFT service configured → starter only; wallet + nftService → starter + filtered NFTs) by making nftService an optional BuildServerOptions field. Production wires it only when both BLOCKFROST_PROJECT_ID and NFT_ALLOWLIST_POLICY_IDS are present, so the deploy keeps booting in environments without Cardano config. NFT entries land as raw UserNft (policyId/assetName/unit/quantity) — the trait→stat enrichment is TASK-027's job, so the field is forward-compatible with that pipeline.

---

### Run [2026-05-10 01:14]
- Task: TASK-027 — Trait→stat derivation: deterministic mapper + collection registry
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/31
- Test counts: core=42, content=17, web=80, server=92, shared=9
- Files changed: packages/db/prisma/schema.prisma, packages/db/prisma/migrations/20260510010000_collection/migration.sql, packages/shared/src/nftMapping.ts, packages/shared/src/nftMapping.test.ts, packages/shared/src/index.ts, packages/shared/package.json, packages/shared/vitest.config.ts, apps/server/src/cardano/collectionStore.ts, apps/server/src/rosterDerivation.ts, apps/server/src/routes/roster.ts, apps/server/src/routes/roster.test.ts, apps/server/src/index.ts
- Regression alert: false
- Deploy: rolled_back (health check timeout 90s → automatic rollback to previous image succeeded; rolled-back app verified healthy on /health)
- Deploy details: prod DB pirate_battle has no tables — Prisma migrations were never applied. Previous deploys "succeeded" only because no boot-time DB query existed; TASK-027's `await collectionStore.listAll()` at startup is the first code that actually hits the DB before /health responds, so it surfaced the latent gap. TASK-027 marked blocked. Fix: run `prisma migrate deploy` against the prod DB (or add a migrate step to deploy.sh / Dockerfile) before unblocking.
- Lessons learned: packages/shared previously had no tests — added vitest dep + test script + workspace-local vitest.config.ts in the same PR per CLAUDE.md "Adding tests to a previously-untested workspace" guidance. Bigger lesson: prod DB has never been migrated; a follow-up infra task is needed before any DB-touching task at startup can ship.

---

### Run [2026-05-10 02:10]
- Task: TASK-005 — Scaffold apps/discord stub + apps/mobile placeholder
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/32
- Test counts: core=42, content=17, shared=9, server=92, web=80
- Files changed: apps/discord/package.json, apps/discord/tsconfig.json, apps/discord/src/index.ts, apps/mobile/README.md, tsconfig.json, package-lock.json
- Regression alert: false
- Deploy: rolled_back (health check timeout 90s → rollback to previous image succeeded). TASK-005 is a pure scaffold change (no runtime code on the server) so the failure is inherited from the unresolved prod-DB gap flagged in TASK-027: server still calls `await collectionStore.listAll()` at startup against a DB with no tables. Marking TASK-005 blocked per Step 14 convention even though the bad startup path didn't originate in this task.
- Lessons learned: deploy will keep rolling back every cycle until the latent prod-migration issue from TASK-027 is fixed (prisma migrate deploy + .env DATABASE_URL pointing at the prod DB, or a Dockerfile/entrypoint migrate step). Worth flagging to the operator before the next cycle.

---

### Run [2026-05-10 03:24]
- Task: TASK-029 — Server: XP grant on battle end + level-up curve
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/33
- Test counts: core=61, content=17, shared=9, web=80, server=105
- Files changed: packages/core/src/{constants.ts, leveling.ts (new), leveling.test.ts (new), index.ts}, packages/db/prisma/{schema.prisma, migrations/20260510030000_battle_captain/migration.sql (new)}, apps/server/src/{crewSnapshot.ts, crewSnapshot.test.ts, userStore.ts, userStore.test.ts (new), battleStore.ts, battleStore.test.ts, routes/battle.ts, routes/battle.test.ts}
- Regression alert: false
- Review proposed: false (4 success cycles since last review at 2026-05-09 23:13 — TASK-026, TASK-027, TASK-005, TASK-029 — below successThreshold=5)
- Deploy: rolled_back (health check timeout 90s → rollback to previous image succeeded; rolled-back app verified healthy on /health). Same root cause as TASK-027/TASK-005: prod DB pirate_battle has no tables — Prisma migrations were never applied — so the boot-time `await collectionStore.listAll()` throws before /health responds. TASK-029 marked blocked per Step 14 convention even though this task didn't introduce the bad startup path.
- Lessons learned: Engine's CrewSnapshot now reflects Crew.level + attrs end-to-end via a new packages/core/leveling module (effectiveStats: linear +5%/level capped at 1.5× base, kept inside the engine so renderers stay derivative). Battle row gained captainId so the action route can resolve the player's persisted Crew rows when winner flips and award per-crew XP via userStore.applyXpRewards (winner ×1.5, loser ×1.0, scaled by opponent level / DEFAULT_LEVEL). Operator action still required: `prisma migrate deploy` against the prod DB before any deploy can succeed — every subsequent cycle will continue rolling back and burning a task to `blocked` until that infra fix lands.

---

### Run [2026-05-10 04:15]
- Task: TASK-036 — Server: /api/discord/link-token + /api/discord/link-claim
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/34
- Test counts: core=61, content=17, shared=9, web=80, server=124
- Files changed: apps/server/src/{discordLinkStore.ts (new), discordLinkStore.test.ts (new), routes/discordLink.ts (new), routes/discordLink.test.ts (new), index.ts, userStore.ts}, packages/db/prisma/{schema.prisma, migrations/20260510040000_user_discord_link/migration.sql (new)}
- Regression alert: false
- Review proposed: pending Step 15
- Deploy: rolled_back (health check timeout 90s → automatic rollback to previous image succeeded; rolled-back app verified healthy on /health). TASK-036 marked blocked per Step 14 convention even though this task didn't introduce the bad startup path — same prod-DB root cause as TASK-027/TASK-005/TASK-029.
- Lessons learned: New `InMemoryDiscordLinkTokenStore` mirrors `InMemoryNonceStore` exactly (issue/consume + injectable randomFn/nowFn) but binds a userId per record so consume returns it; this keeps the bot-side endpoint stateless while still authoritative. `User.discordUserId` is gated by a unique index — setDiscordUserId checks for cross-user conflict before update so the route can return 409 cleanly. Discord ID validation is `^[0-9]+$` + ≤64 chars (Discord snowflakes are decimal strings; a non-numeric ID would never be a real Discord user). Deploy is still expected to roll back due to the unmigrated prod DB flagged in TASK-027/TASK-005/TASK-029 — TASK-036 doesn't introduce that path but inherits it.

---

### Run [2026-05-10 05:21]
- Task: TASK-044 — Server: PvP challenge create/accept + match queue
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/35
- Test counts: core=61, content=17, shared=9, web=80, server=148 (+24)
- Files changed: apps/server/src/{battleAction,battleStore,index,pvpChallengeStore,pvpChallengeStore.test,pvpQueueStore,pvpQueueStore.test}.ts; apps/server/src/routes/{battle,pvp,pvp.test}.ts; packages/db/{prisma/schema.prisma,prisma/migrations/20260510050000_pvp_challenge_and_queue/migration.sql,src/index.ts}
- Regression alert: false
- Deploy: rolled_back (health check 90s timeout, previous image restored ok); task marked blocked
- Lessons learned: Prisma's nullable JSON columns require Prisma.JsonNull (not raw null) in update payloads — needed exporting Prisma as a value (not just a type) from packages/db. Both PvP queue peers must be reachable through one polling endpoint, so PvpQueueEntry carries matchedBattleId rather than relying on transient state. Same prod-DB-migration gap as TASK-027/029/036 keeps bouncing deploys — every cycle that introduces a new migration (or boots a code path that touches the unmigrated tables) will roll back until prod runs `prisma migrate deploy`. Worth surfacing as a roadmap task rather than continuing the rollback streak.

---

### Run [2026-05-10 06:11]
- Task: TASK-019 — Web: turn animation placeholders (sprite shake + flash)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/36
- Test counts: core=61, content=17, shared=9, server=148, web=93 (web +13 from animations.test.ts)
- Files changed: apps/web/src/phaser/animations.ts (new), apps/web/src/phaser/animations.test.ts (new), apps/web/src/phaser/BattleScene.ts, apps/web/src/phaser/BattleCanvas.tsx, apps/web/src/phaser/index.ts
- Regression alert: false
- Deploy: rolled_back (health check 90s timeout, previous image restored ok); task marked blocked
- Lessons learned: pure-TS animation derivation (triggersFromEvents + newEventsSlice) keeps the Phaser scene a thin renderer per CLAUDE.md split; sprite refs stored on scene + RECENT_EVENTS_REGISTRY_KEY thread the just-arrived turn's events into create() without changing the destroy/recreate React lifecycle. Deploy rolled back even though this PR is web-only — the failing image carries TASK-044's PvP code which still references an unmigrated prod DB schema (same root cause flagged in TASK-027/029/036/044). Until prod runs `prisma migrate deploy` (or a roadmap task automates it) every subsequent cycle's deploy will keep rolling back regardless of what the cycle changed.

---

### Run [2026-05-10 07:02]
- Outcome: skipped
- Reason: no_ready_tasks
- Roadmap state: 19 tasks have status=ready, but every one transitively depends on a task in `blocked` state — nothing eligible per Step 5 criteria.
- Root cause (unchanged from TASK-027 onward): prod DB `pirate_battle` has no Prisma migrations applied. Every cycle since 2026-05-10 01:14 (TASK-027, -005, -029, -036, -044, -019) has succeeded at code merge but rolled back at deploy/health-check; Step 14 marks each of those tasks `blocked`, which cascades to dependents (TASK-006, -021, -028, -030, -031, -033, -034, -035, -037, -045, -046, …).
- Operator action required: run `prisma migrate deploy` against prod DB (or add a migrate step to deploy.sh / Dockerfile entrypoint), then unblock the cascaded tasks (`status: ready`, clear `blocked_reason`) on `main` so the autonomous loop has eligible work again. Otherwise the loop will keep firing hourly with `outcome: skipped`.
- Mitigation suggestion: a small "fix prod DB migration on deploy" task could be hand-added to the roadmap (e.g. via `/roadmap-add`) so the autonomous agent itself can ship the deploy.sh / Dockerfile change.

---

### Run [2026-05-10 08:02]
- Outcome: skipped
- Reason: no_ready_tasks
- Roadmap state: 19 tasks have status=ready, but every eligible candidate transitively depends on a task in `blocked` state — same cascade as the prior 2026-05-10 07:02 cycle, no roadmap edits since.
- Root cause (still unresolved): prod DB `pirate_battle` has no Prisma migrations applied. Every Step 12-14 deploy since TASK-027 (2026-05-10 01:14) has rolled back, marking the source task `blocked`, which propagates to dependents (TASK-006, -021, -028, -030, -031, -033, -034, -035, -037, -045, -046, …).
- Operator action required (unchanged): run `prisma migrate deploy` against prod DB (or wire a migrate step into deploy.sh / Dockerfile entrypoint), then unblock the cascaded source tasks on `main` so the autonomous loop has eligible work again.
- Open PRs: #29 (`auto/review-2026-05-09-2316`, self-improvement refinements) — CI green, auto-merge enabled, mergeStateStatus=UNKNOWN at start of this cycle. Independent of the deploy-rollback cascade.
- Until the prod-DB block clears, every hourly fire will continue logging `skipped, no_ready_tasks` — consider pausing `claude-pirate-battle.timer` if the operator needs longer than ~24h to land the migration fix, to keep the log tidy.

---

### Run [2026-05-10 09:01]
- Task: (none)
- Outcome: skipped
- Reason: no_ready_tasks — all 19 ready tasks depend (transitively) on the 5 blocked tasks (TASK-005 / TASK-019 / TASK-027 / TASK-029 / TASK-036 / TASK-044), all blocked on the same root cause: prod DB has no tables (migrations never applied). Unblocks once `prisma migrate deploy` runs against prod DB (manual one-time fix or wire into deploy.sh).
- Deploy: n/a

---

### Run [2026-05-10 10:03]
- Task: (none)
- Outcome: skipped
- Reason: no_ready_tasks — same deploy-rollback cascade as the prior three cycles (07:02, 08:02, 09:01). All 19 ready tasks transitively depend on TASK-005 / TASK-019 / TASK-027 / TASK-029 / TASK-036 / TASK-044, all blocked on the unmigrated prod DB.
- Deploy: n/a
- Operator action still required (unchanged): run `prisma migrate deploy` against prod DB (or wire it into deploy.sh entrypoint), then clear `blocked_reason` on the cascade roots and flip them back to `ready`.
- Open PRs: #29 (`auto/review-2026-05-09-2316`) still open — CI green, auto-merge enabled. Independent of the deploy block.

---

### Run [2026-05-10 11:21]
- Task: TASK-027 — Trait→stat derivation: deterministic mapper + collection registry
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/38
- Test counts: core=61, content=17, shared=9, web=93, server=148
- Files changed: roadmap/roadmap.yml, ROADMAP.md (status flips only — code already on main from PR #31)
- Regression alert: false
- Notes: cascade-rollforward cycle. PR #31 originally rolled back due to missing prod migrations; PR #37 wired `prisma migrate deploy` into deploy.sh, so this re-deploy validates the fix end-to-end. No code changes this cycle.
- Deploy: success (rolling redeploy via patched deploy.sh — `prisma migrate deploy` ran, no pending migrations, /health 200 on attempt 2; cascade unblock confirmed end-to-end)
- Lessons learned: the 6 cascade-root tasks (TASK-005, -019, -027, -029, -036, -044) had their PRs already merged but were re-flipped to `ready` by PR #37 to force fresh deploys via the patched pipeline. Each rollforward cycle is essentially a no-op PR plus a deploy gate.

---

### Run [2026-05-10 12:10]
- Task: TASK-029 — Server: XP grant on battle end + level-up curve
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/39
- Test counts: core=61, content=17, shared=9, web=93, server=148
- Files changed: roadmap/roadmap.yml, ROADMAP.md (status flips only — code already on main from PR #33)
- Regression alert: false
- Notes: cascade-rollforward cycle. PR #33 originally rolled back due to missing prod migrations; PR #37 wired `prisma migrate deploy` into deploy.sh, so this re-deploy validates the fix end-to-end for TASK-029's BattleCaptain migration. No code changes this cycle.
- Deploy: success (rolling redeploy via patched deploy.sh — image pirate-battle:latest rebuilt, `prisma migrate deploy` ran, no pending migrations, /health 200 on attempt 2; cascade rollforward of TASK-029 confirmed end-to-end)
- Review proposed: false (only 2 trailing successes — TASK-027 at 11:21, TASK-029 at 12:10 — the 10:03 skipped cycle broke the streak; below successThreshold=5; PR #29 from 2026-05-09 23:16 still open)

---

### Run [2026-05-10 13:05]
- Task: TASK-036 — Server /api/discord/link-token + /api/discord/link-claim (cascade re-deploy)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/40
- Test counts: core=61, content=17, shared=9, web=93, server=148
- Files changed: roadmap/roadmap.yml, ROADMAP.md (status-flip-only re-deploy; implementation already on main from PR #34)
- Regression alert: false
- Deploy: success
- Review proposed: false (3 trailing successes — TASK-027 11:21, TASK-029 12:10, TASK-036 13:05 — below successThreshold=5; PR #29 from 2026-05-09 23:16 still open anyway)
- Lessons learned: Cascade re-deploy pattern continues from TASK-027/029 — status-flip PRs are sufficient to roll forward already-merged work after deploy.sh fix in PR #37. Stale local branches from squash-merged PRs needed `git branch -D` cleanup before scripts/new-branch.sh could re-use the slug.

---

### Run [2026-05-10 14:04]
- Task: TASK-044 — Server: PvP challenge create/accept + match queue (cascade re-deploy)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/41
- Test counts: core=61, content=17, shared=9, server=148, web=93
- Files changed: roadmap/roadmap.yml, ROADMAP.md (status-flip-only re-deploy; implementation already on main from PR #35)
- Regression alert: false
- Deploy: success (rolling redeploy via patched deploy.sh — image rebuilt, `prisma migrate deploy` ran, no pending migrations, /health 200 on attempt 3; cascade rollforward of TASK-044 confirmed end-to-end)
- Review proposed: false (4 trailing successes — TASK-027 11:21, TASK-029 12:10, TASK-036 13:05, TASK-044 14:04 — below successThreshold=5; PR #29 from 2026-05-09 23:16 still open anyway)
- Lessons learned: Cascade re-deploy continues from TASK-027/029/036 — TASK-044 is the 4th of 6 cascade-root tasks; remaining are TASK-005 (apps/discord stub) and TASK-019 (web turn animations). Stale local branch from squash-merged PR #35 needed `git branch -D` cleanup before scripts/new-branch.sh could re-use the slug — same hiccup noted in TASK-036's lessons.

---

### Run [2026-05-10 15:05]
- Task: TASK-005 — Scaffold apps/discord stub + apps/mobile placeholder (cascade re-deploy)
- Outcome: success
- PR: https://github.com/g-chappell/pirate-battle/pull/42
- Test counts: core=61, content=17, web=93, server=148, shared=9
- Files changed: roadmap/roadmap.yml, ROADMAP.md
- Regression alert: false
- Review proposed: pending Step 15
- Deploy: pending
- Lessons learned: TASK-005 was the last cascade-root task left from the prisma-migrate rollback group (TASK-005/019/027/029/036/044). Rolling it forward unblocks the cascade window.

---

