---
name: roadmap-add
description: Add a single epic, story, or task to roadmap.yml without a full interview. Use for quick additions — a one-line task under an existing story, or a single story under an existing epic. For multi-task epics use /pm-brainstorm → /roadmap-expand.
user-invocable: true
---

# /roadmap-add

Fast-path for single additions. No interview. No branch (optional), no PR —
this skill is for when you know exactly what to add.

## When to use

- "Add a task to clean up dead code in EPIC-03 / STORY-05"
- "Add a story under EPIC-02 about rate limiting"
- Quick fixes during a dev session (the user will commit it themselves)

**When NOT to use:** adding a whole new feature area → `/pm-brainstorm` first.

## Input

The user provides:
- **What** to add: task, story, or epic
- **Where** to nest it: parent ID (or top-level for epic)
- **Required fields** (collected if not provided):
  - Task: title, priority, complexity, workspaces, description
  - Story: title, description, parent epic ID
  - Epic: title, description

## Steps

1. Load `roadmap/roadmap.yml`
2. Find max existing ID of the right type → compute next ID
3. Insert the new node in the right place
4. Run `node roadmap/validate.mjs` — fix issues before writing
5. Run `node roadmap/render.mjs`
6. Show the user the diff of `roadmap.yml`
7. Ask: "Commit now? [y]es (on a roadmap/... branch + PR) / [d]raft (stage only) / [n]o"

On "yes":
```bash
git checkout -b roadmap/add-TASK-<id>
git add roadmap/roadmap.yml ROADMAP.md
git commit -m "roadmap: add <id> <title>"
gh pr create --title "..." --body "..."
gh pr merge --auto --squash
```

## Defaults

If the user doesn't specify:
- Task status: `ready`
- Task priority: `med`
- Task complexity: `small`
- Task workspaces: `[]` (warn — tasks with no workspace often can't be auto-picked up)
- depends_on: `[]`
