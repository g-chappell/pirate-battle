import type { BattleEvent, Side } from "@pirate-battle/core";

export type AnimationTrigger = { kind: "hit"; side: Side } | { kind: "faint"; side: Side };

export const HIT_FLASH_TINT = 0xff3030;
export const HIT_FLASH_DURATION_MS = 120;
export const HIT_SHAKE_OFFSET_PX = 8;
export const HIT_SHAKE_DURATION_MS = 60;
export const FAINT_FADE_ALPHA = 0.25;
export const FAINT_FADE_DURATION_MS = 240;

const OPPOSITE: Record<Side, Side> = { A: "B", B: "A" };

export function triggersFromEvents(events: BattleEvent[]): AnimationTrigger[] {
  const out: AnimationTrigger[] = [];
  for (const ev of events) {
    if (ev.kind === "move" && ev.damage > 0) {
      out.push({ kind: "hit", side: OPPOSITE[ev.side] });
    } else if (ev.kind === "faint") {
      out.push({ kind: "faint", side: ev.side });
    }
  }
  return out;
}

export function newEventsSlice(
  prevLog: readonly BattleEvent[],
  currLog: readonly BattleEvent[],
): BattleEvent[] {
  if (currLog.length <= prevLog.length) return [];
  return currLog.slice(prevLog.length);
}
