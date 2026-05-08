# Roadmap schema migrations

When the `roadmap.yml` schema evolves, write a migration script here that
transforms old-version files into the new version.

## Pattern

File: `v{n}-to-v{n+1}.mjs`

```javascript
export default function migrate(data) {
  // data is the parsed YAML object (pre-migration)
  // return the migrated object
  if (data.version !== N) return data;
  // ...transform fields...
  return { ...data, version: N + 1 };
}
```

Migrations are applied in sequence by `validate.mjs` when it detects a
version mismatch between `roadmap.yml` and the current schema version.

Each migration is a pure function so they chain cleanly.
