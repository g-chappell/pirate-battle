---
name: Read the whole component before editing
description: Read the full file, verify all JSX/props/handlers/branches will survive your edit, before making the change.
type: feedback
---

Before editing any component/module longer than ~50 lines, read the WHOLE
thing first. Verify you understand every sibling element, conditional
render, event handler, and import.

**Why:** The most common bug-creation pattern is: "I replaced this section
with my new version, and accidentally dropped the button / lost the
handler / changed a conditional." The damage is invisible until QA.

**How to apply:**

1. Use `Read` on the entire file (no offset/limit) before you plan the edit.
2. When planning the edit, enumerate what must survive:
   - Every JSX child, including icons/badges/indicators
   - Every event handler bound to preserved elements
   - Every conditional render branch (`{x && <Y/>}`)
   - Every prop spread
3. After the edit, sanity-check: can you point at each of those elements
   in the new code?

**Specific counter-patterns to avoid:**

- Silent deletion of icons, counts, badges from a UI element when the
  task was only to change the layout
- Replacing a `.map()` result wholesale and losing a conditional filter
- Removing a CSS class while "cleaning up"
- Deleting a seemingly-unused import that was actually referenced inside
  a template literal

**When this rule is EXPENSIVE:** large files (500+ lines). Even so, read
the section you're editing plus one function above and below. Don't edit
in isolation.
