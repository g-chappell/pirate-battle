import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import {
  buildInitialBattleState,
  crewSnapshotFromTemplate,
  teamToSnapshots,
} from "./crewSnapshot.js";

describe("crewSnapshotFromTemplate", () => {
  it("populates stats and moves from the content template", () => {
    const template = CREWS_BY_KEY["tide_brawler"]!;
    const moveKey = template.moveKeys[0]!;
    const snap = crewSnapshotFromTemplate(template.templateKey, [moveKey]);
    expect(snap.hp).toBe(template.baseStats.hp);
    expect(snap.maxHp).toBe(template.baseStats.hp);
    expect(snap.atk).toBe(template.baseStats.atk);
    expect(snap.def).toBe(template.baseStats.def);
    expect(snap.spd).toBe(template.baseStats.spd);
    expect(snap.affinity).toBe(template.affinity);
    expect(snap.moves).toEqual([MOVES_BY_KEY[moveKey]]);
    expect(snap.statuses).toEqual([]);
  });

  it("throws on unknown template", () => {
    expect(() =>
      crewSnapshotFromTemplate("not_real", ["tide_surge"]),
    ).toThrow();
  });

  it("throws on unknown move key", () => {
    expect(() =>
      crewSnapshotFromTemplate("tide_brawler", ["not_real_move"]),
    ).toThrow();
  });
});

describe("buildInitialBattleState", () => {
  it("places the first crew of each side as active and rest on bench", () => {
    const team = teamToSnapshots({
      id: "t",
      name: "n",
      factionId: "kraken",
      crews: [
        { templateKey: "tide_brawler", moveKeys: ["tide_surge"] },
        { templateKey: "deep_warden", moveKeys: ["tide_surge"] },
      ],
    });
    const ai = teamToSnapshots({
      id: "ai",
      name: "ai",
      factionId: "ironclad",
      crews: [
        { templateKey: "cannon_master", moveKeys: ["cannonade"] },
        { templateKey: "bulwark_guard", moveKeys: ["cannonade"] },
      ],
    });
    const state = buildInitialBattleState(team, ai, 7);
    expect(state.turn).toBe(0);
    expect(state.activeA.affinity).toBe("kraken");
    expect(state.benchA).toHaveLength(1);
    expect(state.activeB.affinity).toBe("ironclad");
    expect(state.benchB).toHaveLength(1);
    expect(state.rngSeed).toBe(7);
    expect(state.rngState).toBe(7);
    expect(state.log).toEqual([]);
    expect(state.winner).toBeNull();
  });
});
