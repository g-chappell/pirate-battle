# Approvals History

Append-only log of every self-improvement proposal ever made — approved or rejected.
Used by `autonomous-review` as a de-duplication source: items already here never get re-proposed.

## Format

Each entry:

```
### PROP-YYYY-MM-DD-NN
- reviewed: YYYY-MM-DDTHH:MM
- status: approved | rejected
- section: <CLAUDE.md section the proposal targeted>
- content: |
    <the exact proposed text>
```

Do not edit entries after they land. The agent may append but will never modify or delete.
