import { TRAINING_CHIP_KEY } from "@pirate-battle/content";
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

describe("InMemoryUserStore inventory + training", () => {
  it("grantItems stacks qty and returns the new total", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    const first = await store.grantItems(userId, TRAINING_CHIP_KEY, 3);
    expect(first).toEqual({ templateKey: TRAINING_CHIP_KEY, qty: 3 });
    const second = await store.grantItems(userId, TRAINING_CHIP_KEY, 2);
    expect(second).toEqual({ templateKey: TRAINING_CHIP_KEY, qty: 5 });
    const inv = await store.getInventory(userId);
    expect(inv).toEqual([{ templateKey: TRAINING_CHIP_KEY, qty: 5 }]);
  });

  it("grantItems rejects non-positive qty and unknown users", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    expect(await store.grantItems(userId, TRAINING_CHIP_KEY, 0)).toBeNull();
    expect(await store.grantItems(userId, TRAINING_CHIP_KEY, -1)).toBeNull();
    expect(await store.grantItems("ghost", TRAINING_CHIP_KEY, 1)).toBeNull();
  });

  it("consumeItem decrements qty and reports remaining", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    await store.grantItems(userId, TRAINING_CHIP_KEY, 3);
    const result = await store.consumeItem(userId, TRAINING_CHIP_KEY, 1);
    expect(result).toEqual({ ok: true, remaining: 2 });
    const inv = await store.getInventory(userId);
    expect(inv).toEqual([{ templateKey: TRAINING_CHIP_KEY, qty: 2 }]);
  });

  it("consumeItem returns not_found when the user has none of the item", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    const result = await store.consumeItem(userId, TRAINING_CHIP_KEY, 1);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("consumeItem returns insufficient_qty when requesting more than owned", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    await store.grantItems(userId, TRAINING_CHIP_KEY, 1);
    const result = await store.consumeItem(userId, TRAINING_CHIP_KEY, 5);
    expect(result).toEqual({ ok: false, reason: "insufficient_qty" });
    const inv = await store.getInventory(userId);
    expect(inv).toEqual([{ templateKey: TRAINING_CHIP_KEY, qty: 1 }]);
  });

  it("consumeItem rejects non-positive qty as insufficient_qty", async () => {
    const { store, userId } = await setupCaptainWithCrews();
    expect(await store.consumeItem(userId, TRAINING_CHIP_KEY, 0)).toEqual({
      ok: false,
      reason: "insufficient_qty",
    });
    expect(await store.consumeItem(userId, TRAINING_CHIP_KEY, -1)).toEqual({
      ok: false,
      reason: "insufficient_qty",
    });
  });

  it("trainCrewAttribute increments attrs, decrements chips, returns crew", async () => {
    const { store, userId, captainId, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    await store.grantItems(userId, TRAINING_CHIP_KEY, 2);

    const result = await store.trainCrewAttribute({
      userId,
      captainId,
      crewId,
      stat: "atk",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.crew.attrs).toEqual({ atk: 1 });
      expect(result.remainingChips).toBe(1);
    }

    const refreshed = await store.getCaptainTeam(userId, captainId);
    expect(refreshed!.crews[0]!.attrs).toEqual({ atk: 1 });
  });

  it("trainCrewAttribute refuses when no chips remain", async () => {
    const { store, userId, captainId, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    const result = await store.trainCrewAttribute({
      userId,
      captainId,
      crewId,
      stat: "def",
    });
    expect(result).toEqual({ ok: false, reason: "no_chips" });
  });

  it("trainCrewAttribute caps at +20% of base, never consumes a chip past the cap", async () => {
    const { store, userId, captainId, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    // tide_brawler base atk = 60 → cap = 12
    await store.grantItems(userId, TRAINING_CHIP_KEY, 20);

    for (let i = 0; i < 12; i++) {
      const r = await store.trainCrewAttribute({
        userId,
        captainId,
        crewId,
        stat: "atk",
      });
      expect(r.ok).toBe(true);
    }
    const overflow = await store.trainCrewAttribute({
      userId,
      captainId,
      crewId,
      stat: "atk",
    });
    expect(overflow).toEqual({ ok: false, reason: "at_cap" });

    const inv = await store.getInventory(userId);
    expect(inv[0]!.qty).toBe(20 - 12);
  });

  it("trainCrewAttribute rejects cross-captain access", async () => {
    const { store, captainId, team } = await setupCaptainWithCrews();
    const crewId = team.crews[0]!.id!;
    // Different user
    const otherUser = await store.createAnonymous();
    await store.grantItems(otherUser.id, TRAINING_CHIP_KEY, 5);
    const result = await store.trainCrewAttribute({
      userId: otherUser.id,
      captainId,
      crewId,
      stat: "spd",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
