<!-- DO NOT EDIT — this file is generated from roadmap/roadmap.yml -->
<!-- To add tasks: edit roadmap/roadmap.yml, then run `node roadmap/render.mjs` -->
<!-- Or run /roadmap-add or /pm-brainstorm from Claude Code. -->

# Pirate-Battle — Roadmap

_Created: 2026-05-08_

## Summary

- **Total tasks:** 47
- **Done:** 21 (45%)
- **Ready:** 26
- **In progress:** 0
- **Blocked:** 0

---

## EPIC-01 — Foundation — monorepo, server, battle engine v1

Establish the technical spine: TypeScript monorepo (apps/{web,server,
discord,mobile} + packages/{core,content,shared,db}), Postgres-backed
Fastify server, and a server-authoritative turn-based 6v6 swap-in
battle engine. Ships with a free starter crew set so the game is
end-to-end playable before any Cardano integration. The engine lives
in packages/core so web, server, and Discord all share one rules
implementation.

- **STORY-01** — Monorepo scaffold + green CI
  > npm workspaces + TS project refs + skeleton apps + first green CI run that exercises real Node steps.
  - :white_check_mark: **TASK-001** — Init root package.json + npm workspaces + tsconfig.base.json  `high` `small` _(root)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/4)
    > Create root package.json (private, name "pirate-battle",
    > workspaces: ["apps/*", "packages/*"]), tsconfig.base.json
    > with strict mode + composite refs settings, and a root
    > tsconfig.json that references all workspaces.
    > Add scripts: typecheck (tsc -b), test, lint, build, dev.
    > Run npm install at root to generate package-lock.json.
  - :white_check_mark: **TASK-002** — Scaffold packages/{core,content,shared,db} with composite tsconfigs  `high` `small` _(packages/core, packages/content, packages/shared, packages/db)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/4)  
    _depends on: TASK-001_
    > For each of packages/core, packages/content, packages/shared,
    > packages/db: add package.json (name "@pirate-battle/<pkg>",
    > version 0.0.0, type "module"), tsconfig.json with composite:
    > true extending tsconfig.base, src/index.ts placeholder export.
    > Add cross-references in tsconfig.json `references` arrays
    > respecting layering: core depends on nothing; content depends
    > on core; shared depends on core; db is leaf.
  - :white_check_mark: **TASK-003** — Scaffold apps/server (Fastify) with /health endpoint  `high` `small` _(apps/server)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/6)  
    _depends on: TASK-002_
    > apps/server with package.json (deps: fastify, dev: tsx, vitest,
    > @types/node), tsconfig.json (composite, references core +
    > shared + db), src/index.ts with a Fastify instance returning
    > { ok: true } on /health. dev script via tsx watch. start
    > script via node dist/index.js. Build via tsc -b.
  - :white_check_mark: **TASK-004** — Scaffold apps/web (Vite + React) with placeholder route  `high` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/7)  
    _depends on: TASK-002_
    > apps/web with package.json (deps: react, react-dom; devDeps:
    > vite, @vitejs/plugin-react, @types/react, vitest), vite.config.ts,
    > tsconfig.json (composite, references core + shared), index.html,
    > src/main.tsx mounting <App/>, src/App.tsx returning the project
    > name + a "Connect wallet" placeholder. dev on port 5173.
    > Build outputs to dist/.
  - :black_circle: **TASK-005** — Scaffold apps/discord stub + apps/mobile placeholder  `med` `small` _(apps/discord, apps/mobile)_  
    _depends on: TASK-002_
    > apps/discord: package.json with discord.js v14+ dependency,
    > tsconfig.json (composite, references core + shared), src/index.ts
    > with a no-op placeholder (export {}). Real bot lands in EPIC-05.
    > apps/mobile: just a README explaining Capacitor wrap arrives in
    > EPIC-06; do NOT install Capacitor yet.
  - :black_circle: **TASK-006** — ESLint + Prettier root config (flat config)  `med` `small` _(root)_  
    _depends on: TASK-005_
    > eslint.config.js (flat config, ESLint 9+) at root with TS
    > parser, recommended rules, react plugin scoped to apps/web,
    > import-order rule. .prettierrc at root. Add lint + format
    > scripts to root package.json. Verify `npx eslint .` and
    > `npx prettier --check .` both pass on the scaffolded code.

- **STORY-02** — Postgres schema + Prisma migrations
  > packages/db with Prisma schema covering users, captains, crews, moves, items, battles, battle_events. Dev seed + migration workflow.
  - :white_check_mark: **TASK-007** — Prisma schema: users, captains, crews, moves, items  `high` `medium` _(packages/db)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/8)  
    _depends on: TASK-002_
    > packages/db/prisma/schema.prisma with models:
    > - User (id, stakeAddr unique nullable, createdAt)
    > - Captain (id, userId FK, name, factionId, createdAt)
    > - Crew (id, captainId FK, templateKey, level, xp, attrs JSON,
    >   createdAt)
    > - CrewMove (id, crewId FK, moveKey, slot, isLearned)
    > - Item (id, ownerUserId FK, templateKey, qty)
    > Generator output to packages/db/generated/client. Add to
    > .gitignore. Add prisma/seed.ts placeholder. db
    > connection from DATABASE_URL env.
  - :white_check_mark: **TASK-008** — Prisma schema: battles + battle_events + initial migration  `high` `medium` _(packages/db)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/9)  
    _depends on: TASK-007_
    > Add to schema.prisma:
    > - Battle (id, mode (PvE/PvP/AI), participantA/B userIds,
    >   resultJson JSON, seed Bytes, startedAt, endedAt nullable)
    > - BattleEvent (id, battleId FK, idx int, kindStr, payloadJson)
    > - Index battleId+idx for replay scan
    > Run `prisma migrate dev --name init` to create the first
    > migration. Commit prisma/migrations/.
    > Verify generated client compiles + exports the models.
    > Export a configured PrismaClient from packages/db/src/index.ts.

- **STORY-03** — Battle engine v1 (deterministic, replay-able)
  > Pure-TS engine in packages/core: turn loop, action queue, swap-in, faint, 4-affinity type matrix, basic moves. Same seed → same outcome.
  - :white_check_mark: **TASK-009** — Engine types + state shape (BattleState, Crew, Move, Action)  `high` `medium` _(packages/core)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/11)  
    _depends on: TASK-002_
    > packages/core/src/types.ts: TS types for BattleState (turn,
    > activeA, activeB, benchA, benchB, log, rngSeed, rngState),
    > CrewSnapshot (hp, maxHp, atk, def, spd, affinity, statuses,
    > moves), MoveDef (key, name, affinity, basePower, accuracy,
    > kind: damage/status/buff, statusEffect?), Action union (move,
    > switch, forfeit). Affinity union: 'kraken'|'ironclad'|'phantom'|
    > 'bloodborne'. No I/O. Export from src/index.ts.
  - :white_check_mark: **TASK-010** — Engine: turn loop + action queue + swap-in + faint  `high` `large` _(packages/core)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/12)  
    _depends on: TASK-009_
    > packages/core/src/engine.ts: pure functions resolveTurn(state,
    > actionA, actionB, rng) → newState. Order: switch actions
    > resolve first (both at once); then move actions resolve in
    > priority then speed order; faint check; auto-prompt for swap
    > if active fainted; battle ends when one side has no
    > non-fainted crew. Seeded RNG via simple xoshiro128 or mulberry32
    > (deterministic, no Math.random). Append BattleEvent objects to
    > state.log. No mutation — return new state each call.
  - :white_check_mark: **TASK-011** — Engine: damage formula, accuracy, status effects, type matrix  `high` `large` _(packages/core)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/14)  
    _depends on: TASK-010_
    > In packages/core/src/engine.ts (or split into
    > src/resolveMove.ts): implement damage = floor(((2*lvl/5+2) *
    > power * atk/def) / 50) + 2 with affinity multiplier from a
    > 4×4 type chart. Accuracy roll uses RNG. Status effects:
    > poison (1/8 max hp end of turn), burn (1/16 + atk halved),
    > stun (skip turn, 30% off-chance). Crit on 1/16 default.
    > All values exported as constants for tuning.
    > Type matrix (attacker → defender): kraken strong vs ironclad
    > and bloodborne; ironclad strong vs phantom; phantom strong vs
    > kraken; bloodborne strong vs phantom.
  - :white_check_mark: **TASK-012** — Engine determinism unit tests (Vitest)  `high` `medium` _(packages/core)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/15)  
    _depends on: TASK-011_
    > packages/core/src/engine.test.ts: given fixed initial state +
    > fixed action sequence + fixed seed, the resulting log is
    > byte-equal across 100 runs. Cover: simple damage exchange,
    > status proc on right turn, faint + swap-in, side-victory.
    > These tests are the highest-leverage tests in the codebase —
    > break them and you've broken replays. Configure Vitest at
    > workspace level.

- **STORY-04** — Free starter crew + content package
  > 8 hand-authored crews (2 per OTK faction) + 16 base moves (4 per affinity), plus item templates. All in packages/content with strict types.
  - :white_check_mark: **TASK-013** — Author 16 base moves (4 per affinity) in packages/content  `high` `medium` _(packages/content)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/16)  
    _depends on: TASK-009_
    > packages/content/src/moves.ts exporting an array typed
    > against MoveDef from packages/core. 4 moves per affinity:
    > kraken (e.g. Tide Surge, Ink Cloud, Tentacle Lash, Maelstrom),
    > ironclad (e.g. Cannonade, Hull Plate, Rivet Salvo, Iron Will),
    > phantom (e.g. Vanish, Phantom Strike, Mirage, Blood Fade),
    > bloodborne (e.g. Cutlass Combo, Boarding Charge, Berserk, Last
    > Stand). Mix damage / status / buff per affinity. Cite OTK
    > lore where applicable; mark [DRAFT] for unconfirmed flavour.
  - :white_check_mark: **TASK-014** — Author 8 starter crews (2 per faction) with stats + 4 moves each  `high` `medium` _(packages/content)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/18)  
    _depends on: TASK-013_
    > packages/content/src/crews.ts: 8 starter crew templates,
    > keyed by templateKey, with affinity, base attrs (hp, atk,
    > def, spd) totalling ~250, 4 starter move keys, lore blurb.
    > 2 per faction. Include: 1 balanced + 1 specialist per
    > faction. Rare/legendary tiers come later — these are common
    > starters anyone can play with.

## EPIC-02 — Web client v1 — first playable battle

First playable web client. Player connects (anonymous starter session
— no wallet yet), assembles a team from the free starter crew, fights
one PvE opponent, sees turn-by-turn animated battle. Validates engine
+ UX shape before tackling identity (EPIC-03).

- **STORY-05** — Anonymous starter session + team builder UI
  - :white_check_mark: **TASK-015** — Server: anonymous session create + cookie + GET /me  `high` `medium` _(apps/server, packages/db)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/19)  
    _depends on: TASK-008, TASK-003_
    > apps/server: POST /api/session/anonymous creates a User row
    > with stakeAddr=null, sets a signed session cookie (use
    > @fastify/cookie + a SESSION_SECRET-keyed signature). GET /me
    > returns the current user (id, stakeAddr, captains[]). 401 if
    > no cookie. Server-side session store can be JWT-style for now.
  - :white_check_mark: **TASK-016** — Web: starter session bootstrap + team builder UI  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/20)  
    _depends on: TASK-015, TASK-014, TASK-004_
    > apps/web: on app load, if no session cookie, POST
    > /api/session/anonymous. Display the free starter crew
    > (read from packages/content) and let user pick 6 for their
    > team. POST /api/captain to persist (server creates Captain +
    > 6 Crew rows). UI in plain React for now — Phaser comes in
    > STORY-06. Use TanStack Query or a small fetch wrapper.

- **STORY-06** — Phaser battle scene
  - :white_check_mark: **TASK-017** — Web: install Phaser 3 + scaffold BootScene/BattleScene  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/21)  
    _depends on: TASK-016_
    > Install phaser in apps/web. Add a Phaser game instance bound
    > to a <canvas> rendered inside a React component. BootScene
    > loads placeholder sprites (4 affinity-coloured rectangles
    > for now). BattleScene takes a BattleState prop and displays
    > the active crew + HP bars. Don't build the move menu yet.
  - :white_check_mark: **TASK-018** — Web: BattleScene HP bars + move menu + swap UI  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/22)  
    _depends on: TASK-017_
    > Extend BattleScene: visible HP bars (Phaser Graphics rects),
    > move menu (DOM overlay React component, NOT in canvas — per
    > CLAUDE.md "React owns DOM chrome, Phaser owns canvas"), swap
    > button revealing bench. Wire submit → POST /api/battle/<id>/action.
    > Display turn log in a side panel (also React DOM).
  - :black_circle: **TASK-019** — Web: turn animation placeholders (sprite shake + flash)  `med` `small` _(apps/web)_  
    _depends on: TASK-018_
    > Minimal hit feedback: when an attack lands, flash the target
    > red and add a brief x-offset shake via Phaser tweens. When
    > a crew faints, fade the sprite. Real sprite art arrives
    > post-MVP — these placeholders verify the animation hooks
    > are wired.

- **STORY-07** — First PvE opponent + win/loss screens
  - :white_check_mark: **TASK-020** — Server: AI opponent + battle create/resolve endpoints  `high` `large` _(apps/server, packages/core)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/24)  
    _depends on: TASK-012, TASK-016_
    > apps/server: POST /api/battle/start — given userId, create a
    > Battle row, generate an AI opponent (fixed lore-flavoured team
    > for v1), seed RNG. POST /api/battle/:id/action — accept a
    > user Action, run AI's action via simple heuristic (pick the
    > move with highest expected damage given affinity matrix),
    > call resolveTurn from packages/core, persist BattleEvents,
    > return new state. GET /api/battle/:id — current state.
  - :black_circle: **TASK-021** — Web: win/loss screens + battle history list  `med` `small` _(apps/web)_  
    _depends on: TASK-020, TASK-019_
    > On Battle.endedAt set, BattleScene transitions to a result
    > modal: winner, turn count, summary stats per crew. Button
    > "Battle again" creates a new Battle. History list page
    > shows the user's last 10 Battle rows with mode + result.

## EPIC-03 — Cardano wallet identity & NFT roster

Replace anonymous sessions with wallet-based identity. CIP-30 on web,
signed-message auth, NFT discovery from an admin-managed allow-list of
Cardano collections via Blockfrost, deterministic trait → stat mapping.
Free starter remains usable; NFT crews add to the available roster.

- **STORY-08** — CIP-30 wallet connect + signed-message auth
  - :white_check_mark: **TASK-022** — Web: CIP-30 wallet chooser + connect flow  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/25)  
    _depends on: TASK-016_
    > apps/web: detect window.cardano keys, present a wallet
    > chooser (Nami, Eternl, Lace, Typhon at minimum), call
    > wallet.enable(). Get reward (stake) address. Display a
    > "Connected as <truncated bech32 addr>" indicator. Persist
    > chosen wallet in localStorage so re-enable on reload skips
    > the prompt when wallet.isEnabled() is true.
  - :white_check_mark: **TASK-023** — Server: signed-message auth (POST /api/auth/wallet)  `high` `large` _(apps/server)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/26)  
    _depends on: TASK-022, TASK-015_
    > apps/server: POST /api/auth/nonce returns a fresh nonce +
    > 5-min expiry, stored server-side. POST /api/auth/wallet
    > accepts { stakeAddr, payloadHex, signature, key } from CIP-30
    > signData. Verify with cardano-message-signing-nodejs +
    > cardano-serialization-lib-nodejs: signature math, pubkey
    > hashes to claimed addr, payload contains the issued nonce
    > that hasn't been used. On success: find or create User by
    > stakeAddr, migrate any anonymous session's data (captains
    > etc.) to the new userId, set session cookie. Reject 401 with
    > clear reason on mismatch.
  - :white_check_mark: **TASK-024** — Web: sign-in flow integration (request nonce → signData → POST)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/27)  
    _depends on: TASK-023_
    > Web client calls /api/auth/nonce, builds a human-readable
    > login message including the nonce, calls api.signData(stakeAddr,
    > payloadHex), POSTs to /api/auth/wallet. On 200: navigate to
    > roster page. Display friendly errors for: user-cancelled,
    > network mismatch, signature failed.

- **STORY-09** — NFT discovery service (Blockfrost) with allow-list + caching
  - :white_check_mark: **TASK-025** — Server: Blockfrost client + allow-list config + NFT fetch  `high` `medium` _(apps/server, packages/db)_ · [PR](https://github.com/g-chappell/pirate-battle/pull/28)  
    _depends on: TASK-008, TASK-023_
    > apps/server/src/cardano/blockfrost.ts: typed wrapper around
    > @blockfrost/blockfrost-js using BLOCKFROST_PROJECT_ID +
    > BLOCKFROST_NETWORK env vars. fetchUserNfts(stakeAddr) →
    > filters accountAddressesAssetsAll by allow-list policy IDs
    > from NFT_ALLOWLIST_POLICY_IDS env. Cache results in a new
    > NftSnapshot table (Prisma migration) keyed (userId,
    > fetchedAt) with 5-min freshness window before refetch.
  - :black_circle: **TASK-026** — Server: GET /api/roster (free starter + NFT crews)  `high` `medium` _(apps/server)_  
    _depends on: TASK-025_
    > GET /api/roster returns { starter: [...], nft: [...] } —
    > starter is the 8 free crews from packages/content;
    > nft is what fetchUserNfts found, mapped through the
    > trait→stat pipeline (TASK-027). Web team builder consumes
    > this to populate the chooser.

- **STORY-10** — Trait → stat derivation pipeline + admin tooling
  - :black_circle: **TASK-027** — Trait→stat derivation: deterministic mapper + collection registry  `high` `large` _(apps/server, packages/db, packages/shared)_  
    _depends on: TASK-026_
    > packages/shared/src/nftMapping.ts: pure function
    > deriveCrewStats(metadata, collectionRules) → CrewSnapshot.
    > Rules are JSON keyed by trait name → stat delta. Add a
    > Collection table (Prisma) holding policyId, name, ruleJson.
    > Server: at boot, load all Collection rows; deriveCrewStats
    > applied to each NFT in fetchUserNfts. Deterministic — same
    > input → same output, no RNG, no DB lookup mid-derive.
  - :black_circle: **TASK-028** — Admin: CLI tool to register a new collection (policyId + ruleJson)  `med` `medium` _(apps/server, packages/db)_  
    _depends on: TASK-027_
    > apps/server/scripts/register-collection.ts (CLI). Args:
    > --policy <id>, --name <text>, --rules <jsonFile>.
    > Validates JSON shape (matches collectionRules schema), inserts
    > into Collection table. Re-runnable as upsert. Document in
    > docs/ADMIN.md (new file). Bonus: --dry-run.

## EPIC-04 — Crew progression, items & battle stats

The meta-game layer that turns one-off battles into a campaign. XP per
battle, level-up, attribute training, items dropped + applied to crews,
battle-history with replays. Persistence keyed on User; survives across
sessions and devices.

- **STORY-11** — XP, level-up, attribute training UI
  - :black_circle: **TASK-029** — Server: XP grant on battle end + level-up curve  `high` `medium` _(apps/server, packages/core)_  
    _depends on: TASK-020, TASK-007_
    > On Battle.endedAt set, server grants XP to participating
    > Crew rows (winner ×1.5, loser ×1.0, scaled by opponent
    > level). Level curve: lvl² × 50 XP. On level up: each crew
    > gains base attrs * 1.05 ratio, capped per template. Engine's
    > CrewSnapshot consumes Crew.level + attrs at battle start.
  - :black_circle: **TASK-030** — Web: crew detail screen + attribute training UI  `med` `medium` _(apps/web)_  
    _depends on: TASK-029_
    > Web: clicking a crew opens a detail panel — sprite, lore
    > blurb, stats, moves, XP bar. "Train" button spends an in-game
    > currency (TrainingChip Item) to bias one stat (+1 atk or +1
    > def or +1 spd). 1 chip = 1 stat point, capped at +20% of
    > base per stat. Server enforces caps server-side.

- **STORY-12** — Item system: drops, inventory, apply-to-crew
  - :black_circle: **TASK-031** — Server: item drops on battle win + inventory endpoint  `med` `medium` _(apps/server, packages/content)_  
    _depends on: TASK-029_
    > packages/content/src/items.ts: 8 starter item templates
    > (TrainingChip, MinorPotion, AffinityRune-x4, RareToken).
    > Drop table keyed on opponent difficulty. On battle win:
    > roll drop table, increment Item.qty for the user. GET
    > /api/inventory returns user's items. POST /api/item/apply
    > applies an item (e.g. potion → restore HP between battles,
    > chip → goes to training UI).
  - :black_circle: **TASK-032** — Web: inventory UI + apply flow  `med` `small` _(apps/web)_  
    _depends on: TASK-031_
    > Inventory page: list items by type with qty. "Use" → modal
    > prompting which crew to apply to (if relevant). Update
    > optimistically; reconcile on server response.

- **STORY-13** — Battle stats + replay viewer
  - :black_circle: **TASK-033** — Server: aggregate per-crew W/L, K/D + GET /api/stats  `med` `medium` _(apps/server)_  
    _depends on: TASK-029_
    > Aggregate query reading Battle + BattleEvent: per-user
    > total wins, losses, win rate; per-crew K/D, KO contribution,
    > winning-team participation. GET /api/stats[?crewId=...].
    > Cached for 60s per user.
  - :black_circle: **TASK-034** — Web: replay viewer (re-render BattleEvents through engine)  `med` `large` _(apps/web, packages/core)_  
    _depends on: TASK-033, TASK-019_
    > Replay page: GET /api/battle/:id with full BattleEvents.
    > Re-step through events in BattleScene with a play/pause/scrub
    > control. Same engine code runs locally — replays are
    > deterministic by design. Verify via packages/core's
    > determinism tests.

## EPIC-05 — Discord bot — fully playable battles

Discord-as-first-class-client. Players link Discord ↔ wallet via a
one-time signed-message handshake; slash commands run real battles
against the same backend; embeds render the battle state with HP bars
+ move announcements; messages edit/append as turns resolve.
Async-friendly so battles can span hours.

- **STORY-14** — Discord bot scaffold + Discord↔wallet identity linking
  - :black_circle: **TASK-035** — Discord bot scaffold + slash command registration tooling  `high` `medium` _(apps/discord)_  
    _depends on: TASK-005_
    > apps/discord/src/index.ts: discord.js Client with intents
    > [Guilds]. Reads DISCORD_TOKEN. apps/discord/scripts/register-commands.ts:
    > REST API call to register commands. Use
    > applicationGuildCommands(CLIENT_ID, DEV_GUILD_ID) when
    > DISCORD_DEV_GUILD_ID is set (instant dev iteration), else
    > applicationCommands (global). Run as a one-off deploy step,
    > not on bot startup.
  - :black_circle: **TASK-036** — Server: /api/discord/link-token + /api/discord/link-claim  `high` `medium` _(apps/server)_  
    _depends on: TASK-023_
    > apps/server: POST /api/discord/link-token (auth required by
    > wallet session) returns a one-time token (15-min expiry).
    > POST /api/discord/link-claim accepts { token, discordUserId }
    > from the bot, looks up the User, sets User.discordUserId,
    > invalidates token. Reject if token already used / expired.
  - :black_circle: **TASK-037** — Discord bot: /link command + DM flow → server claim  `high` `medium` _(apps/discord)_  
    _depends on: TASK-035, TASK-036_
    > /link slash command: tells the user to visit the web app
    > while signed in, run "Generate link token" (web UI
    > button → POST /api/discord/link-token), then send the bot
    > the token via a follow-up /link-claim <token>. On claim,
    > bot calls server's /api/discord/link-claim with the token +
    > the invoking Discord user id. Confirmation DM on success.

- **STORY-15** — Slash commands suite: /team /battle /move /switch /forfeit /stats
  - :black_circle: **TASK-038** — Discord: /team + /battle + /stats slash commands  `high` `medium` _(apps/discord, apps/server)_  
    _depends on: TASK-037, TASK-033_
    > /team — embed listing user's captains + crews, HP / level /
    > moves. /battle <opponent | "ai"> — initiate a Battle row;
    > embed-render initial state. /stats [@user] — aggregate W/L
    > from /api/stats. Each command resolves Discord user → User
    > row via discordUserId; rejects if not linked.
  - :black_circle: **TASK-039** — Discord: /move + /switch + /forfeit (turn actions)  `high` `medium` _(apps/discord, apps/server)_  
    _depends on: TASK-038_
    > In-battle slash commands: /move <name>, /switch <crewName>,
    > /forfeit. Server enforces it's the user's turn. Bot edits
    > the original /battle embed (held by message id stored on
    > Battle row) with the new state. Out-of-turn → ephemeral
    > error. Ephemeral hint includes available actions.

- **STORY-16** — Embed-based battle renderer + async match state machine
  - :black_circle: **TASK-040** — Embed renderer (HP bars, move announcement, type-effectiveness)  `high` `medium` _(apps/discord)_  
    _depends on: TASK-038_
    > renderBattleEmbed(state) → EmbedBuilder. HP shown as
    > pseudo-graphical bar (`██████░░░░ 60/100`), per-side
    > affinity emoji indicator, move log of last 3 turns,
    > type-effectiveness call-outs ("super effective!"). Deterministic
    > — same state in → same embed out. Pure function; testable.
  - :black_circle: **TASK-041** — Async match state machine (Battle messageId, edit lifecycle)  `high` `large` _(apps/server, apps/discord)_  
    _depends on: TASK-039, TASK-040_
    > Battle row tracks discordChannelId + discordMessageId. On
    > every action that mutates state, the bot edits the existing
    > message via channel.messages.edit. On 15-min interaction-
    > token expiry boundary, fall back to channel.send for fresh
    > "current state" message; old message is updated to "view
    > continued at <link>". State recovery: bot start should
    > reconcile in-flight battles (Battle.endedAt is null) by
    > re-fetching their messages and resyncing timestamps.

## EPIC-06 — Mobile delivery + Async PvP

Wrap the web build for iOS + Android via Capacitor; sort out mobile
wallet UX (CIP-45 / WalletConnect). Add async PvP — challenge a friend
by link, leaderboard, ranked-lite. All against the existing backend
engine; no new authority anywhere.

- **STORY-17** — Capacitor wrap (iOS + Android) + mobile wallet UX
  - :black_circle: **TASK-042** — apps/mobile: Capacitor scaffold pointing at apps/web build  `high` `medium` _(apps/mobile, apps/web)_  
    _depends on: TASK-021_
    > apps/mobile: install @capacitor/core + cli, capacitor.config.ts
    > with webDir = "../web/dist" and appId/appName set. Run
    > `npx cap add ios` + `npx cap add android` (results
    > committed). Add scripts: build (npm run build -w apps/web
    > && npx cap sync), open:ios, open:android. Verify both native
    > projects open in Xcode/Android Studio without errors.
  - :black_circle: **TASK-043** — Mobile wallet UX: CIP-45/WalletConnect bridge + fallback  `high` `large` _(apps/mobile, apps/web)_  
    _depends on: TASK-042, TASK-024_
    > Detect mobile user agent; switch wallet-connect path from
    > window.cardano (browser ext) to CIP-45 / WalletConnect
    > session. Use @walletconnect/universal-provider with the
    > Cardano namespace adapter. For wallets without CIP-45
    > support, deep-link to a known dApp browser (e.g. Eternl
    > mobile) via custom scheme; document fallback in docs/MOBILE.md.

- **STORY-18** — Async PvP: challenge-by-link + match queue + persistence
  - :black_circle: **TASK-044** — Server: PvP challenge create/accept + match queue  `high` `large` _(apps/server)_  
    _depends on: TASK-020_
    > POST /api/pvp/challenge creates a Challenge row (tokenized
    > link, 24h expiry). Anyone with the link who is signed in
    > can POST /api/pvp/challenge/:token/accept, which creates a
    > PvP-mode Battle. Each user submits Actions independently;
    > server resolves a turn once both sides have submitted (or
    > an action timeout fires, default 12h). Also: open queue
    > mode — POST /api/pvp/queue puts you into a pool, server
    > pairs by ELO/random; GET /api/pvp/queue/status polls.
  - :black_circle: **TASK-045** — Web: PvP UI (generate challenge link, accept, in-progress list)  `high` `medium` _(apps/web)_  
    _depends on: TASK-044_
    > PvP page: button "Challenge a friend" → generates link;
    > copy-to-clipboard. List of in-progress PvP battles with
    > "their move pending" / "your move pending" badges. Click
    > opens BattleScene in async mode. "Find a match" → enters
    > the queue; pings on match found.

- **STORY-19** — Leaderboard + season/ladder skeleton
  - :black_circle: **TASK-046** — Server: ELO calc + Season + per-season leaderboard endpoint  `med` `medium` _(apps/server, packages/db)_  
    _depends on: TASK-044_
    > Add Season table (id, name, startsAt, endsAt). Add elo +
    > seasonId to user's PvP record. ELO update on PvP battle end
    > (K=32). GET /api/leaderboard/:seasonId paginated by ELO desc.
    > Cron-equivalent: open a fresh Season on month boundary
    > (call out in scripts/season-cron.sh; wire to system cron
    > later — out of scope here).
  - :black_circle: **TASK-047** — Web + Discord: leaderboard views  `med` `small` _(apps/web, apps/discord)_  
    _depends on: TASK-046_
    > Web: /leaderboard page, paginated. Discord: /leaderboard
    > [season] embed, top 10 with rank/name/elo. Both consume
    > GET /api/leaderboard/:seasonId.
