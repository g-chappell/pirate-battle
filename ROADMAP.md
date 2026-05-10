<!-- DO NOT EDIT — this file is generated from roadmap/roadmap.yml -->
<!-- To add tasks: edit roadmap/roadmap.yml, then run `node roadmap/render.mjs` -->
<!-- Or run /roadmap-add or /pm-brainstorm from Claude Code. -->

# Pirate-Battle — Roadmap

_Created: 2026-05-08_

## Summary

- **Total tasks:** 0
- **Done:** 0 (0%)
- **Ready:** 0
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
  > >-
