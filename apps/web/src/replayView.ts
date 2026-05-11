import {
  type BattleEvent,
  type BattleState,
  deriveInitialState,
  stateAtCursor,
} from "@pirate-battle/core";

import { describeBattleEvent } from "./battleView";

export interface ReplayTimeline {
  initial: BattleState;
  events: readonly BattleEvent[];
}

export function buildReplayTimeline(finalState: BattleState): ReplayTimeline {
  return {
    initial: deriveInitialState(finalState),
    events: finalState.log,
  };
}

export function clampCursor(cursor: number, eventCount: number): number {
  if (!Number.isFinite(cursor)) return 0;
  if (cursor < 0) return 0;
  if (cursor > eventCount) return eventCount;
  return Math.floor(cursor);
}

export function stateAtReplayCursor(timeline: ReplayTimeline, cursor: number): BattleState {
  const clamped = clampCursor(cursor, timeline.events.length);
  return stateAtCursor(timeline.initial, timeline.events, clamped);
}

export interface ReplayCursorInfo {
  cursor: number;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  currentEvent: BattleEvent | null;
  currentEventDescription: string;
}

export function cursorInfo(timeline: ReplayTimeline, cursor: number): ReplayCursorInfo {
  const total = timeline.events.length;
  const clamped = clampCursor(cursor, total);
  const lastIndex = clamped - 1;
  const currentEvent = lastIndex >= 0 ? (timeline.events[lastIndex] ?? null) : null;
  return {
    cursor: clamped,
    total,
    atStart: clamped === 0,
    atEnd: clamped === total,
    currentEvent,
    currentEventDescription: currentEvent
      ? describeBattleEvent(currentEvent)
      : "Battle start — no events yet",
  };
}

export function nextCursor(cursor: number, total: number): number {
  return clampCursor(cursor + 1, total);
}

export function prevCursor(cursor: number, total: number): number {
  return clampCursor(cursor - 1, total);
}

export const DEFAULT_REPLAY_STEP_MS = 800;
