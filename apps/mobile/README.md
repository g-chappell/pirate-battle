# @pirate-battle/mobile

Capacitor wrap of `apps/web` for native iOS / Android delivery.

**Status:** placeholder. Capacitor is not installed yet.

The mobile shell lands in **EPIC-06**. Until then this directory is
intentionally empty (no `package.json`, no `node_modules`) so npm
workspaces (`apps/*` glob) skips it.

When EPIC-06 starts, the wrap will:

- Initialise Capacitor over the existing `apps/web` Vite build
  (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`).
- Configure CIP-45 / WalletConnect for wallet pairing on mobile (CIP-30
  is browser-only).
- Add `ios/` and `android/` native projects whose generated artefacts
  must be gitignored in the same PR (see `CLAUDE.md` → Scaffolding hygiene).

Do not add Capacitor dependencies here ahead of that work.
