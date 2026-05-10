import { TRAINING_CHIP_KEY } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { buildCrewDetail, getChipCount, type CaptainTeamCrewView } from "./crewDetail.js";

const baseCrew: CaptainTeamCrewView = {
  id: "crew-1",
  templateKey: "tide_brawler",
  level: 50,
  xp: 25,
  moveKeys: ["tide_surge", "tentacle_lash"],
  attrs: null,
};

describe("buildCrewDetail", () => {
  it("returns null for unknown templates", () => {
    expect(buildCrewDetail({ ...baseCrew, templateKey: "ghost_xx" })).toBeNull();
  });

  it("computes effective stats, cap, trained delta, and xp ratio", () => {
    const d = buildCrewDetail(baseCrew)!;
    expect(d.template.name).toBe("Tide Brawler");
    expect(d.rows).toHaveLength(3);

    const atk = d.rows.find((r) => r.stat === "atk")!;
    expect(atk.base).toBe(60);
    expect(atk.trained).toBe(0);
    expect(atk.cap).toBe(12);
    expect(atk.canTrain).toBe(true);

    expect(d.xpForNext).toBeGreaterThan(0);
    expect(d.xpRatio).toBeCloseTo(25 / d.xpForNext, 5);

    expect(d.moves).toEqual([
      { key: "tide_surge", name: "Tide Surge" },
      { key: "tentacle_lash", name: "Tentacle Lash" },
    ]);
  });

  it("flags a stat that has hit the cap as canTrain=false", () => {
    const d = buildCrewDetail({ ...baseCrew, attrs: { atk: 12 } })!;
    const atk = d.rows.find((r) => r.stat === "atk")!;
    expect(atk.trained).toBe(12);
    expect(atk.canTrain).toBe(false);
  });

  it("xpRatio is clamped to [0,1] when xp exceeds the per-level requirement", () => {
    const d = buildCrewDetail({ ...baseCrew, xp: 9_999_999 })!;
    expect(d.xpRatio).toBe(1);
  });

  it("falls back to the move key when a name is missing", () => {
    const d = buildCrewDetail({ ...baseCrew, moveKeys: ["definitely_not_a_move"] })!;
    expect(d.moves).toEqual([{ key: "definitely_not_a_move", name: "definitely_not_a_move" }]);
  });
});

describe("getChipCount", () => {
  it("reads the training-chip count from a sparse inventory", () => {
    expect(getChipCount([])).toBe(0);
    expect(getChipCount([{ templateKey: "other", qty: 5 }])).toBe(0);
    expect(getChipCount([{ templateKey: TRAINING_CHIP_KEY, qty: 3 }])).toBe(3);
  });
});
