---
name: Trace before patching
description: When a failure's symptom moves location after each fix, stop patching and trace the data flow end-to-end.
type: feedback
---

If you've "fixed" a bug 2+ times and the failure moved to a different
symptom each time, stop patching. You're chasing downstream symptoms of a
deeper cause.

**Why:** Iterating on symptoms wastes CI time, commits, and confidence.
Each push-and-wait cycle costs real minutes. A one-hour investigation
up front beats a six-hour patch marathon.

**How to apply:**

1. When a symptom jumps locations on successive fixes, **stop**.
2. Write down the observed symptom chain:
   - Attempt 1: symptom at X, fixed Y, now symptom appears at A
   - Attempt 2: fixed A, now symptom appears at B
3. Ask: what's the single upstream call path that produces all of X, A, B?
4. Read that path end-to-end — every function, every state mutation —
   before editing anything.
5. Identify the actual root cause. Usually it's:
   - A subtle state-timing issue (async race, useEffect re-fire)
   - A wrong mental model of a framework API (e.g. reactive vs. imperative)
   - A boundary mismatch (client thinks X, server thinks Y)
6. Only then make the fix.

**Signals you should trace, not patch:**

- "The fix worked locally but CI still fails" → maybe a different root cause
- "The error message changed after my fix" → yes, trace
- "I'm now getting two failures instead of one" → STOP. Trace.

**Real example (from battleships):** A multiplayer E2E test failed with
`winner === "opponent"` after several "fix" cycles blamed different
subsystems (reconnect, Nimble trait, turn-switching). The true cause was
that firing at every cell gave the AI 83 turns — enough to win. Fix: fire
only at ship cells so AI never gets a turn. Each prior patch cycle had
been treating symptoms.
