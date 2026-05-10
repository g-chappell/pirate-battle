import { describe, expect, it } from "vitest";
import type { BattleEvent } from "@pirate-battle/core";

import {
  FAINT_FADE_ALPHA,
  FAINT_FADE_DURATION_MS,
  HIT_FLASH_DURATION_MS,
  HIT_FLASH_TINT,
  HIT_SHAKE_DURATION_MS,
  HIT_SHAKE_OFFSET_PX,
  newEventsSlice,
  triggersFromEvents,
} from "./animations";

describe("triggersFromEvents", () => {
  it("returns no triggers for an empty log", () => {
    expect(triggersFromEvents([])).toEqual([]);
  });

  it("derives a hit trigger on the OPPOSITE side from a damaging move", () => {
    const events: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "tentacle-strike",
        damage: 12,
        targetHpAfter: 30,
        crit: false,
        effective: 1,
      },
    ];
    expect(triggersFromEvents(events)).toEqual([{ kind: "hit", side: "B" }]);
  });

  it("ignores moves that did zero damage", () => {
    const events: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "intimidate",
        damage: 0,
        targetHpAfter: 50,
        crit: false,
        effective: 0,
      },
    ];
    expect(triggersFromEvents(events)).toEqual([]);
  });

  it("ignores misses, stun-skips, status applications, and ticks", () => {
    const events: BattleEvent[] = [
      { kind: "miss", side: "A", moveKey: "x" },
      { kind: "stun_skip", side: "B", moveKey: "y" },
      { kind: "status_apply", side: "A", status: "burn" },
      {
        kind: "status_tick",
        side: "B",
        status: "burn",
        damage: 4,
        targetHpAfter: 10,
      },
    ];
    expect(triggersFromEvents(events)).toEqual([]);
  });

  it("derives a faint trigger on the side that fainted", () => {
    expect(triggersFromEvents([{ kind: "faint", side: "B" }])).toEqual([
      { kind: "faint", side: "B" },
    ]);
  });

  it("preserves event order across mixed events", () => {
    const events: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "x",
        damage: 5,
        targetHpAfter: 10,
        crit: false,
        effective: 1,
      },
      { kind: "miss", side: "B", moveKey: "y" },
      {
        kind: "move",
        side: "B",
        moveKey: "z",
        damage: 7,
        targetHpAfter: 0,
        crit: true,
        effective: 2,
      },
      { kind: "faint", side: "A" },
      { kind: "swap_required", side: "A" },
      { kind: "victory", side: "B" },
    ];
    expect(triggersFromEvents(events)).toEqual([
      { kind: "hit", side: "B" },
      { kind: "hit", side: "A" },
      { kind: "faint", side: "A" },
    ]);
  });
});

describe("newEventsSlice", () => {
  const ev = (i: number): BattleEvent => ({
    kind: "miss",
    side: "A",
    moveKey: `m${i}`,
  });

  it("returns the tail of currLog beyond prevLog's length", () => {
    const prev = [ev(0), ev(1)];
    const curr = [ev(0), ev(1), ev(2), ev(3)];
    expect(newEventsSlice(prev, curr)).toEqual([ev(2), ev(3)]);
  });

  it("returns an empty array when nothing was appended", () => {
    const prev = [ev(0), ev(1)];
    expect(newEventsSlice(prev, prev)).toEqual([]);
  });

  it("returns an empty array when currLog is shorter (defensive)", () => {
    expect(newEventsSlice([ev(0), ev(1)], [ev(0)])).toEqual([]);
  });

  it("returns the full currLog when prevLog is empty", () => {
    const curr = [ev(0), ev(1)];
    expect(newEventsSlice([], curr)).toEqual(curr);
  });
});

describe("animation constants", () => {
  it("exposes positive tween durations and offsets", () => {
    expect(HIT_FLASH_DURATION_MS).toBeGreaterThan(0);
    expect(HIT_SHAKE_DURATION_MS).toBeGreaterThan(0);
    expect(HIT_SHAKE_OFFSET_PX).toBeGreaterThan(0);
    expect(FAINT_FADE_DURATION_MS).toBeGreaterThan(0);
  });

  it("uses a 24-bit flash tint", () => {
    expect(HIT_FLASH_TINT).toBeGreaterThanOrEqual(0);
    expect(HIT_FLASH_TINT).toBeLessThanOrEqual(0xffffff);
  });

  it("fades to a partial alpha so the sprite stays visible", () => {
    expect(FAINT_FADE_ALPHA).toBeGreaterThan(0);
    expect(FAINT_FADE_ALPHA).toBeLessThan(1);
  });
});
