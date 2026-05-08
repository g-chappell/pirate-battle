---
name: ux-discovery
description: UX / user-researcher mindset. Take an epic or story, probe the user for flows + edge cases + acceptance criteria, and emit tasks rich enough for the autonomous agent to implement without re-interviewing. Use between /pm-brainstorm and /roadmap-expand for user-facing features.
user-invocable: true
---

# /ux-discovery

Adopt a **UX researcher + interaction designer mindset**. Translate a fuzzy
epic/story into concrete user flows and acceptance criteria that an
implementation agent can execute against.

## When to use

- After `/pm-brainstorm` drafted an epic but the stories lack acceptance criteria
- For any user-facing feature (UI, API UX, CLI ergonomics)
- When an existing task keeps bouncing back because its description is too vague
- **Skip** for pure backend / infra tasks that have no user-facing surface

## Input

Accepts either:
- An epic draft from `/pm-brainstorm` (structured)
- A plain-text user description ("I want to let users upload images and...")
- A specific story by ID from `roadmap.yml`

## Context to load

- `roadmap/roadmap.yml` for neighboring work
- `CLAUDE.md` Tier 3 (tech-coupled rules) — especially testing patterns and
  UI conventions
- Any existing UI components referenced (read before proposing changes)

## Interview flow

### 1. Persona

- Who is the primary user for this flow? (from the epic's JTBD)
- Any secondary personas? (admins, guests, anonymous users)
- What device / context will they be in?

### 2. Entry points

- How does the user arrive at this flow? (which page, which action, which link)
- Is there an alternate entry? (deep link, share URL, CLI flag)

### 3. Happy path

Walk through the success sequence step by step:

```
Step 1: User does X
Step 2: System shows Y
Step 3: User confirms
Step 4: System persists / navigates / notifies
Step 5: User sees final state Z
```

For each step, note:
- What UI surface is involved (button, modal, toast, route)
- What data moves (request body, response shape)
- What animates or transitions (if relevant)

### 4. Edge cases and error states

Probe explicitly — users rarely volunteer these:

- Validation: what if a field is empty / too long / wrong format?
- Auth: what if user is guest / expired session / no permissions?
- Network: what if request times out / server 500s?
- Concurrency: what if two users do this simultaneously?
- Empty state: what does the UI show when there's no data yet?
- Loading state: what's shown during async operations?

### 5. Accessibility + responsive

- Keyboard navigation path (tab order)
- Screen-reader labels for non-text controls
- Mobile/tablet layout at smaller breakpoints
- Color contrast on the brand palette (if specified in CLAUDE.md)

### 6. Out of scope

Explicitly list what's NOT being built in this pass. The user will thank
you for this later.

## Output (tasks ready for roadmap-expand)

Produce a refined structure with acceptance criteria per task:

```yaml
epic:
  id: EPIC-<carried-from-input>
  title: "..."
  stories:
    - title: "<story title>"
      description: |
        <why>
      user_flow:
        - "User navigates to /foo"
        - "User fills field X, clicks Submit"
        - "System validates, shows toast 'Saved'"
      acceptance_criteria:
        - "Button 'Save' is disabled when field X is empty"
        - "Toast 'Saved' appears within 500ms of successful response"
        - "Error toast 'Server unavailable' shows on 500"
      out_of_scope:
        - "Email notification on save"
      tasks:
        - title: "Build <component> with field X"
          priority: high
          complexity: small
          workspaces: [client]
          description: |
            Component renders form with one text field + Submit button.
            Field validates non-empty on blur and on submit. On submit,
            POST /api/foo. On 2xx, show 'Saved' toast. On 4xx/5xx, show
            'Server unavailable' toast.
            Testid: `form-foo-submit`, `form-foo-field-x`.
          depends_on: []
        - title: "API: POST /api/foo"
          priority: high
          complexity: small
          workspaces: [server]
          description: |
            Accepts `{ x: string }`. Validates x non-empty, length ≤ 200.
            Persists. Returns `{ id, createdAt }`. 400 on validation,
            500 on DB error.
          depends_on: []
        - title: "Tests: end-to-end foo creation"
          priority: med
          complexity: small
          workspaces: [e2e]
          description: |
            Playwright test: registered user navigates, fills field,
            clicks Submit, asserts toast + new item in list.
          depends_on: [<id-of-component-task>, <id-of-api-task>]
```

Tasks must be:
- **Specific** — name the component, endpoint, testid
- **Small** — ≤ 1 day of work; split if larger
- **Testable** — reference acceptance criteria or describe the test
- **Linked** — declare dependencies between UI/API/tests

## Handoff

```
Next step: pass this to /roadmap-expand to add it to the roadmap.
```

## Anti-patterns

- Don't design the database schema or pick libraries — that's tech-coupled
- Don't invent new brand / color / typography — cite CLAUDE.md
- Don't write code samples longer than 2 lines — just describe the contract
- Don't skip edge cases to save time — this is exactly when they're cheapest
  to capture
