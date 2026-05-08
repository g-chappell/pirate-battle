---
name: roadmap-expand
description: Take structured output from /pm-brainstorm or /ux-discovery (or hand-drafted) and inject it into roadmap.yml. Auto-generates IDs, validates, re-renders ROADMAP.md, and commits on a dedicated roadmap/ branch with a PR. Never writes to main directly.
user-invocable: true
---

# /roadmap-expand

The **writer** step that lands new work in `roadmap.yml`. Separate from
`/pm-brainstorm` and `/ux-discovery` so those stay focused on thinking and
interviewing.

## When to use

- Invoked by `/pm-brainstorm` or `/ux-discovery` after user approves a draft
- Standalone: user brings a pre-drafted epic/stories/tasks YAML and wants it
  added with IDs and validation
- From `/init-autonomous` Phase 6 for the initial seed

## Input shapes accepted

1. **Structured object** (preferred — from pm-brainstorm / ux-discovery):

   ```yaml
   epic:
     title: "..."
     description: "..."
     stories: [...]
   ```

2. **Raw text**: a paragraph describing an epic. In that case, warn the user
   that results will be rougher without pm-brainstorm's probing first.

3. **Multiple epics at once** (from `/init-autonomous` Phase 6):

   ```yaml
   epics:
     - epic: { ... }
     - epic: { ... }
   ```

## Steps

### 1. Read current state

- Load `roadmap/roadmap.yml`
- Find the max `EPIC-NN`, `STORY-NN`, and `TASK-NNN` across the entire tree

### 2. Assign IDs

- New epics: next sequential `EPIC-<n+1>`
- New stories: next sequential `STORY-<n+1>` (globally unique, not per-epic)
- New tasks: next sequential `TASK-<n+1>` (zero-padded to 3 digits)

IDs are global — never reuse an ID even if a task was deleted.

### 3. Normalize fields

For every new task, ensure these fields exist (defaults shown):

```yaml
status: ready
priority: med
complexity: small
workspaces: []
description: null
depends_on: []
pr: null
completed: null
blocked_reason: null
last_attempted: null
attempt_count: 0
```

Convert workspace name strings to match `.claude/project.json.workspaces[].name`.
Reject if any workspace doesn't exist (ask user to add it or drop the reference).

### 4. Validate

Write the updated `roadmap.yml` to a temp file first, then run:

```bash
node roadmap/validate.mjs
```

If validation fails, **do not commit**. Print the exact error and ask the
user to fix the input.

### 5. Render

```bash
node roadmap/render.mjs
```

### 6. Branch + PR (branch-as-payload)

Never write directly to main. Always:

```bash
git checkout -b roadmap/<date>-<short-topic>   # e.g. roadmap/2026-04-20-auth-epic
git add roadmap/roadmap.yml ROADMAP.md
git commit -m "roadmap: add <epic title>"
git push -u origin HEAD

gh pr create \
  --title "Roadmap: <epic title>" \
  --body "$(cat <<EOF
Adds <N> epics / <M> stories / <K> tasks to the roadmap.

<ID list:>
- EPIC-XX: ...
- STORY-XX: ...
- TASK-XXX: ...

This PR only modifies roadmap.yml and ROADMAP.md. Review the rendered
markdown and the YAML diff.
EOF
)"

gh pr merge --auto --squash
```

Return the PR URL to the user.

## Failure modes

- **Validation fails:** don't commit. Print the error. Let the user refine
  their draft and retry.
- **Workspace reference unknown:** print the valid workspace names from
  `project.json`; ask user to correct or drop.
- **Duplicate title within same epic:** warn, ask if it's intentional.
- **Cycle in depends_on:** validator will catch; print the cycle chain.

## Not this skill's job

- Interviewing the user → use `/pm-brainstorm` or `/ux-discovery` first
- Implementing any task → `/autonomous-run` picks ready tasks
- Editing a single existing task → use `/roadmap-add` instead

## Example flow

```
User: /pm-brainstorm
  → PM interview produces an epic draft
User: "looks good, send it"
  → /roadmap-expand called with the draft
  → Assigns IDs, validates, renders, opens PR
  → "Opened PR #42: Roadmap: User auth epic"
User reviews PR, merges.
Autonomous agent picks up the first ready task on its next scheduled run.
```
