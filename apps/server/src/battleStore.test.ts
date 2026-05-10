import type { BattleEvent, BattleState } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { InMemoryBattleStore } from "./battleStore.js";

function emptyState(seed = 1): BattleState {
  return {
    turn: 0,
    activeA: {
      hp: 100,
      maxHp: 100,
      atk: 50,
      def: 50,
      spd: 50,
      level: 50,
      affinity: "kraken",
      statuses: [],
      moves: [],
    },
    activeB: {
      hp: 100,
      maxHp: 100,
      atk: 50,
      def: 50,
      spd: 50,
      level: 50,
      affinity: "ironclad",
      statuses: [],
      moves: [],
    },
    benchA: [],
    benchB: [],
    log: [],
    rngSeed: seed,
    rngState: seed,
    pendingSwapA: false,
    pendingSwapB: false,
    winner: null,
  };
}

describe("InMemoryBattleStore", () => {
  it("create + get round-trip", async () => {
    const store = new InMemoryBattleStore();
    const created = await store.create({
      ownerUserId: "u1",
      captainId: "cap_1",
      state: emptyState(),
    });
    expect(created.ownerUserId).toBe("u1");
    expect(created.captainId).toBe("cap_1");

    const fetched = await store.get(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.captainId).toBe("cap_1");
    expect(fetched?.state.turn).toBe(0);
  });

  it("get returns null for unknown id", async () => {
    const store = new InMemoryBattleStore();
    const fetched = await store.get("nope");
    expect(fetched).toBeNull();
  });

  it("recordTurn updates state and appends events", async () => {
    const store = new InMemoryBattleStore();
    const created = await store.create({
      ownerUserId: "u1",
      captainId: null,
      state: emptyState(),
    });

    const newEvents: BattleEvent[] = [
      {
        kind: "move",
        side: "A",
        moveKey: "x",
        damage: 10,
        targetHpAfter: 90,
        crit: false,
        effective: 1,
      },
    ];
    const newState: BattleState = {
      ...created.state,
      turn: 1,
      log: [...created.state.log, ...newEvents],
    };
    const updated = await store.recordTurn(created.id, newState, newEvents);
    expect(updated.state.turn).toBe(1);
    expect(store.getEvents(created.id)).toHaveLength(1);
  });
});
