---
name: Edit one file at a time
description: Never batch-edit 3+ files without running typecheck between. Catch ripple errors at the earliest possible point.
type: feedback
---

When implementing a task, edit one file, verify (typecheck + targeted
tests), then move to the next. Never batch 3+ file edits without checking.

**Why:** Type errors and broken references are cheapest to diagnose when
the change surface is one file. A batch of 5 edits produces a cascade of
errors where the actual cause is buried. The `post-edit.mjs` hook
automates this — don't defeat it by rapid-firing edits.

**How to apply:**

1. Read the full file you're about to edit (especially React components,
   services, configs). Confirm you understand all sibling elements,
   handlers, and conditional renders.
2. Make the change.
3. Let the PostToolUse hook run typecheck + targeted tests.
4. If any errors appear: fix them before moving on. Do NOT stack another
   edit on top.
5. Only after the current file is green, move to the next.

**Exception:** multi-file atomic refactors (e.g. rename a symbol across
10 files) where the intermediate state is broken by design. In those
cases:
- Make all the mechanical edits in one commit
- Run the full test suite at the END, not between each edit
- Still read every file first

**Counter-pattern:** "I'll fix all the types after I write the code."
By then you have 40 errors and no idea which was the first. One at a
time is faster in wall-clock time even though it feels slower.
