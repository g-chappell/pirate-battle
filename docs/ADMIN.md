# Pirate-Battle — Admin operations

Operational tooling for OTK admins and operators. Commands live in
`apps/server/scripts/` and run against the server's database via the same
Prisma client the runtime uses.

> All commands assume `DATABASE_URL` is set (the Prisma client refuses to
> start without it). Run them from the repo root or from `apps/server/`.

## `register-collection` — register or update an NFT collection

Cardano NFT collections that should map to playable crews are allow-listed
in the `Collection` table. Each row binds a policy id to a human-readable
name and a `CollectionRules` JSON document that drives trait → stat
derivation (see `packages/shared/src/nftMapping.ts`).

`register-collection` is the upsert tool for that table: pass the policy
id, a display name, and a path to a rules JSON file, and the row is
created on first run / updated on subsequent runs.

### Usage

```bash
npm run register-collection --workspace @pirate-battle/server -- \
  --policy <56-hex policy id> \
  --name "Order of the Kraken" \
  --rules ./otk-rules.json
```

Add `--dry-run` to validate inputs (policy id format, file readability,
rules schema) without touching the database. Dry-run output indicates
whether a real run would `created` or `updated` the row.

```bash
npm run register-collection --workspace @pirate-battle/server -- \
  --policy <56-hex policy id> \
  --name "Order of the Kraken" \
  --rules ./otk-rules.json \
  --dry-run
```

`--flag value` and `--flag=value` forms are both accepted. `--help`
prints usage.

### Arguments

| Flag        | Required | Description                                               |
| ----------- | -------- | --------------------------------------------------------- |
| `--policy`  | yes      | 56-char hex Cardano policy id (case-insensitive).         |
| `--name`    | yes      | Display name shown in admin UI / roster fallbacks.        |
| `--rules`   | yes      | Path to a JSON file matching the `CollectionRules` shape. |
| `--dry-run` | no       | Validate without writing. Reports `would create/update`.  |

### Rules JSON schema

The rules file must match the `CollectionRules` TypeScript type exported
from `@pirate-battle/shared`. Required fields:

- `baseStats`: object with integer `hp`, `atk`, `def`, `spd` (all >= 1).
- `baseLevel`: integer (>= 1).
- `baseAffinity`: one of `kraken | ironclad | phantom | bloodborne`.
- `baseMoves`: non-empty array of `MoveDef` (each with `key`, `name`,
  `affinity`, integer `basePower` >= 0, integer `accuracy` 0–100,
  `kind` of `damage | status | buff`).
- `traits` (optional, defaults to `{}`): map of trait name → map of
  trait value → `TraitRule`. Each rule must define at least one of
  `delta` (stat overrides), `affinity`, or `moves`.

Minimal example:

```json
{
  "baseStats": { "hp": 70, "atk": 50, "def": 50, "spd": 50 },
  "baseLevel": 5,
  "baseAffinity": "kraken",
  "baseMoves": [
    {
      "key": "tide_surge",
      "name": "Tide Surge",
      "affinity": "kraken",
      "basePower": 65,
      "accuracy": 100,
      "kind": "damage"
    }
  ],
  "traits": {
    "rarity": {
      "legendary": {
        "delta": { "hp": 20, "atk": 10 },
        "affinity": "phantom"
      }
    }
  }
}
```

Validation errors include the field path (e.g.
`rules.traits.rarity.legendary.delta.hp: must be a finite integer`) so
you can locate the bad field quickly in large rule sets.

### Exit codes

- `0` — created / updated / dry-run OK.
- `1` — runtime failure (DB write, file read, schema validation).
- `2` — argv parse error (missing flag, unknown flag, value missing).
