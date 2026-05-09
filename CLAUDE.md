# CLAUDE.md — Pirate-Battle

> Three tiers of rules live here, clearly separated. `autonomous-review` only
> proposes additions to Tier 2 (project conventions) and Tier 3 (tech-coupled).
> Tier 1 (universal rules) is frozen — do not edit.

## Project overview

Pirate-Battle is a Pokémon-style team battle game set in the **Order of the Kraken** universe. The player is a pirate **captain** ("trainer") leading a team of pirate **crews** ("Pokémon"), training and equipping them and battling AI or human captains in 6v6 swap-in turn-based fights. Crews are curated from Cardano NFTs in the player's wallet (admin-managed allow-list of OTK-aligned collections), with a free starter set so non-NFT holders can play PvE. Three first-class clients share one server-authoritative backend: web (Vite + React + Phaser 3), native mobile (Capacitor wrap), and a fully-playable Discord bot (slash commands + embed-rendered battles). Sibling product to **Colonize** — same OTK / NW 2191 lore canon, separate game.

## Tech stack

- **Language:** TypeScript (end-to-end, strict mode)
- **Framework:** TS monorepo (npm workspaces + TS project references)
  - Web: Vite + React + Phaser 3
  - Mobile: Capacitor (deferred until EPIC-06)
  - Server: Fastify (schema-first, plugin model)
  - Discord: discord.js v14+
- **Runtime:** Node 20+
- **Database:** Postgres 16 + Prisma ORM (matches Colonize)
- **Cardano:** CIP-30 (web) / CIP-45-WalletConnect (mobile); Blockfrost for chain reads; cardano-serialization-lib + cardano-message-signing-nodejs for server-side signed-message verification
- **Test framework:** Vitest
- **CI:** GitHub Actions
- **Deploy:** docker compose on srv1604573.hstgr.cloud (target: `pirate-battle.blacksail.dev`, port 3001, auto-deploy on merge with health-check rollback)

## Key commands

```bash
npm run dev                                   # start dev servers (web + server in parallel)
npm test --workspaces --if-present            # run tests
tsc -b                                        # type checking (composite projects)
eslint .                                      # lint
npm run build --workspaces --if-present       # production build
```

## Workspace structure

```
pirate-battle/
├── apps/
│   ├── web/         # Vite + React + Phaser 3 (battle scene + UI shell)
│   ├── server/      # Fastify + Prisma + Postgres (authoritative engine + API)
│   ├── discord/     # discord.js bot (slash commands + embeds)
│   └── mobile/      # Capacitor wrap of apps/web (deferred to EPIC-06)
└── packages/
    ├── core/        # Battle engine — pure TS, deterministic, replay-able
    ├── content/     # Crews / moves / items / lore data
    ├── shared/      # Cross-app types & API contracts (Zod / TypeBox)
    └── db/          # Prisma schema + generated client
```

**Cross-workspace imports use package names** (`@pirate-battle/core`), never relative paths across workspaces.

---

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 1 — UNIVERSAL RULES. Frozen. autonomous-review will never modify. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Universal rules

- Only implement exactly what is requested. Do not add extra systems, abstractions, or features beyond the scope of the ask.
- Edit one file at a time. Run typecheck + targeted tests after each edit before moving to the next.
- Read the full file/component before modifying it. Verify all sibling elements, handlers, and conditional branches survive the edit.
- Never skip tests after a change — even a "trivial" one. UI changes especially need explicit verification.
- If you notice unrelated brokenness, flag it; do not fix in the same PR.
- Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- Default to writing no comments. Only add when the **why** is non-obvious.
- Never introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10). Fix immediately if you notice.
- Do not take destructive git actions (force-push to main, hard-reset, amend published commits) without explicit user approval.
- Never commit secrets (.env, credentials). Warn if a user asks to.

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 2 — PROJECT CONVENTIONS. Edit freely. autonomous-review may append. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Project conventions

- **Branch naming:** `auto/<TASK-ID>-<slug>` (e.g. `auto/TASK-007-battle-engine-turn-loop`).
- **Branch-as-payload:** roadmap status changes (ready → in-progress → done) travel through the PR. Never edit `roadmap/roadmap.yml` directly on `main`.
- **Auto-merge:** every PR enables `gh pr merge <n> --auto --squash --delete-branch` immediately after creation. Manual merge is the exception, not the rule.
- **PR titles:** short, semantic, scope-prefixed (`feat: …`, `fix: …`, `chore: …`). Body cites the task ID (`Refs TASK-XXX`).
- **Cross-workspace imports:** always via package name (`@pirate-battle/core`), never relative. Anchored by `tsconfig.base.json` paths + npm workspaces resolution.
- **Single source of truth for game rules:** `packages/core` owns the engine. Web/mobile render it; server runs it; Discord renders it via embeds. No client re-implements rules.
- **Lore canon:** any narrative content (crew bios, move flavour text, opponent dialogue) cites `lore/OTK.md` section numbers and respects `[ESTABLISHED]` / `[DRAFT]` / `[OPEN]` tiers. Never resolve `[OPEN]` items without explicit human author sign-off. **Until `lore/OTK.md` exists in the repo,** mark all flavour as `[DRAFT]` and proceed — do not block content tasks on the canon file's absence; the citations get backfilled when the canon lands.
- **Sibling consistency with Colonize:** if a tech-stack change is proposed (ORM swap, framework upgrade, lockfile manager change), check whether the same change applies to Colonize — divergence has cost. See `~/.claude/memory/project_otk_shared_stack.md`.

## Scaffolding hygiene

- **Gitignore new tooling artefacts in the same PR that introduces the tool.** Audit what the tool writes on first run and add those paths to `.gitignore` before opening the PR. Common leaks for this stack:
  - **TypeScript / tsc -b:** `*.tsbuildinfo`
  - **Vite / web:** `.vite/`, `dist/`
  - **Prisma:** generated client should live inside `packages/db/generated/` (already gitignored via `packages/db/generated/`); never commit it
  - **Capacitor / mobile (when EPIC-06 lands):** `ios/App/App/public/`, `ios/Pods/`, `ios/build/`, `android/build/`, `android/.gradle/`, `android/app/build/`, `DerivedData/`
  - **Docker:** local-only `*.deploy-lock`, `.previous-image`
  - **Editors / OS:** `.idea/`, `.DS_Store`, `Thumbs.db`

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 3 — TECH-COUPLED RULES. Evolves with the stack. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Testing patterns

- **Vitest** in monorepo workspace mode (one root config with `projects: [...]`, or per-workspace `vitest.config.ts`).
- **Adding tests to a previously-untested workspace** requires three things in the same PR: (1) `vitest` in `devDependencies`, (2) `"test": "vitest run --passWithNoTests"` in `scripts`, (3) a workspace-local `vitest.config.ts` with explicit `include: ["src/**/*.test.ts"]`. Without the explicit include, Vitest's default glob picks up any future `*.spec.ts` files and the suite drifts silently.
- **Engine determinism tests** live in `packages/core`. Same seed → same battle log, byte-for-byte. These are the highest-leverage tests in the codebase; never weaken them.
- **Non-determinism engine tests** (accuracy, crit, stun-skip, status apply) construct a `constantRng(value)` or `scriptedRng([...])` helper that implements the `Rng` shape directly — they do NOT seed the canonical `createRng()` and assert on byte-equal logs. This decouples assertions from any future RNG tuning. Reserve seeded `createRng()` for the determinism suite where byte-equality IS the contract.
- **Fastify route tests** use `fastify.inject()` — no real socket, ~10ms per call. Don't spin up `fastify.listen()` in unit tests.
- **Prisma tests** use a per-worker test database keyed on `VITEST_WORKER_ID`. Don't mock Prisma in integration tests — mocked Prisma tests pass while real queries fail.
- **Blockfrost** is mocked at module boundary in CI. Never hit the real API in tests; rate limits and flakes will bite.
- **Discord bot** tests mock the discord.js client at module boundary; never connect to real Discord in CI.
- **Web client integration** uses Playwright over the Vite dev build. Phaser scene logic is tested at the `packages/core` level (pure TS); only assertions about *rendering* belong in Playwright.

## Architecture notes

- **Server-authoritative.** All game-state mutations resolve on `apps/server`. Web, mobile, and Discord clients render and dispatch user intents — they never decide outcomes. Discord-as-first-class-client forces this; we lean into it everywhere.
- **`packages/core` is I/O-free.** Pure TS rules. No DB, no Phaser, no fetch, no fs. The server wraps `core` with a Fastify route + Prisma persistence; the web client imports `core` only for type-aware UI helpers (e.g. "what moves can this crew select"); the Discord bot imports `core` for embed-rendering of state shapes.
- **React + Phaser split (web).** React owns the DOM chrome (menus, modals, lobby UI). Phaser owns the battle canvas. They communicate via an event bus (or shared Zustand store). Don't render HUD inside Phaser; don't render the canvas inside React.
- **Three battle render modes:** web (Phaser sprites), mobile (Phaser sprites via Capacitor), Discord (embeds with HP bars + move announcements). Each consumes the same `BattleState` shape from `packages/core`; renderers are swappable.
- **Cardano isolation.** The `BLOCKFROST_PROJECT_ID` and signature-verification crypto live ONLY in `apps/server`. The web client never sees the API key. Server-side signed-message verification uses `cardano-message-signing-nodejs` + `cardano-serialization-lib-nodejs` (WASM — keep loaded in memory; cold-start adds 100-500ms).
- **Identity model.** Cardano stake address is the user identity. Discord links one-time via `/link` command + DM'd token. Anonymous starter sessions migrate to a wallet-backed user on first connect.
- **NFT discovery + caching.** NFT lists are cached per stake address (minutes); CIP-25 metadata is cached forever (immutable at mint). Server-side only — never call Blockfrost from the browser.

<!--
When either section above grows past ~10 multi-paragraph bullets, split
subsystem-specific rules into a **nested CLAUDE.md** placed under the
subsystem's directory (e.g. `apps/server/src/battle/CLAUDE.md`,
`packages/core/CLAUDE.md`, `apps/discord/src/commands/CLAUDE.md`).
Claude Code loads nested CLAUDE.md files on demand when a file in or
below that directory is read (load_reason `nested_traversal`), so the
root `CLAUDE.md` stays thin and subsystem content only enters context
when relevant.

Why nested CLAUDE.md and not `.claude/rules/` or `docs/notes/` with
`@-imports`:
- `@-imports` inside `.claude/rules/*.md` do NOT resolve — the import
  line is delivered as literal text, the referenced file never loads.
  Confirmed on Colonize 2026-04-24 via `InstructionsLoaded` telemetry.
- `.claude/` paths are rejected by the Claude Code CLI's Edit tool
  under `--dangerously-skip-permissions`, so the autonomous cycle
  cannot refine anything stored there.
- Nested CLAUDE.md avoids both — loads automatically, lives outside
  `.claude/`, editable by the cycle.

See the Colonize project for a working example of this layout.
-->


---

## Autonomous workflow

This project uses an autonomous development agent. Key facts:

- Tasks live in `roadmap/roadmap.yml`. Render with `node roadmap/render.mjs`.
- Branches follow `auto/<TASK-ID>-<slug>`.
- Roadmap status changes travel through the PR (branch-as-payload) — never committed directly to main.
- Every 5 consecutive successful tasks, the agent proposes CLAUDE.md refinements. Review via `/autonomous-approve`.
- CI required checks: `ci` (typecheck + lint + test + build). Optional: `e2e`.
- Auto-merge enabled on main; branch protection requires `ci`.
- Auto-deploy on merge: `pirate-battle.blacksail.dev` (port 3001) with health-check rollback.

See `docs/RUNBOOK.md` for troubleshooting and `docs/ARCHITECTURE.md` for deeper
context on why the workflow is shaped this way.
