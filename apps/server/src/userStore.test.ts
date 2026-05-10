import { DEFAULT_LEVEL, xpToAdvance } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import { InMemoryUserStore } from "./userStore.js";

async function setupCaptainWithCrews() {
  const store = new InMemoryUserStore();
  const user = await store.createAnonymous();
  const captain = await store.createCaptain(user.id, {
    name: "Test",
    factionId: "kraken",
    crews: [
      { templateKey: "tide_brawler", moveKeys: ["tide_surge"] },
      { templateKey: "deep_warden", moveKeys: ["tide_surge"] },
    ],
  });
  if (!captain) throw new Error("captain create failed");
  const team = await store.getCaptainTeam(user.id, captain.id);
  if (!team) throw new Error("team fetch failed");
  return { store, userId: user.id, captainId: captain.id, team };
}

describe("InMemoryUserStore createCaptain", () => {
  it("seeds new crews at DEFAULT_LEVEL with zero xp and null attrs", async () => {
    const { team } = await setupCaptainWithCrews();
    expect(team.crews).toHaveLength(2);
    for (const crew of team.crews) {
      expect(crew.id).toBeTruthy();
      expect(crew.level).toBe(DEFAULT_LEVEL);
      expect(crew.xp).toBe(0);
      expect(crew.attrs).toBeNull();
    }
  });
});

describe("InMemoryUserStore applyXpRewards", () => {
  it("adds xp without leveling when below threshold", async () => {
    const { store, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    const gain = xpToAdvance(DEFAULT_LEVEL) - 1;
    const [progress] = await store.applyXpRewards([{ crewId, xpGain: gain }]);
    expect(progress).toEqual({
      crewId,
      level: DEFAULT_LEVEL,
      xp: gain,
      levelsGained: 0,
    });
  });

  it("advances level when xp crosses threshold", async () => {
    const { store, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    const gain = xpToAdvance(DEFAULT_LEVEL);
    const [progress] = await store.applyXpRewards([{ crewId, xpGain: gain }]);
    expect(progress).toEqual({
      crewId,
      level: DEFAULT_LEVEL + 1,
      xp: 0,
      levelsGained: 1,
    });
  });

  it("persists progress so subsequent reads see the new level/xp", async () => {
    const { store, userId, captainId, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    await store.applyXpRewards([{ crewId, xpGain: xpToAdvance(DEFAULT_LEVEL) + 7 }]);
    const refreshed = await store.getCaptainTeam(userId, captainId);
    const updated = refreshed!.crews.find((c) => c.id === crewId)!;
    expect(updated.level).toBe(DEFAULT_LEVEL + 1);
    expect(updated.xp).toBe(7);
  });

  it("ignores awards for unknown crew ids", async () => {
    const { store } = await setupCaptainWithCrews();
    const result = await store.applyXpRewards([{ crewId: "does_not_exist", xpGain: 100 }]);
    expect(result).toEqual([]);
  });

  it("returns [] when given no awards", async () => {
    const { store } = await setupCaptainWithCrews();
    expect(await store.applyXpRewards([])).toEqual([]);
  });
});
