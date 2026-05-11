import { describe, expect, it } from "vitest";

import { DEFAULT_ELO } from "./elo.js";
import { InMemorySeasonStore } from "./seasonStore.js";

const MAY_2026 = Date.UTC(2026, 4, 1);
const JUNE_2026 = Date.UTC(2026, 5, 1);
const JULY_2026 = Date.UTC(2026, 6, 1);

describe("InMemorySeasonStore.findCurrent", () => {
  it("returns null when no season is open", async () => {
    const store = new InMemorySeasonStore();
    expect(await store.findCurrent(MAY_2026)).toBeNull();
  });

  it("returns the season covering the timestamp", async () => {
    const store = new InMemorySeasonStore();
    const season = await store.open({
      name: "2026-05",
      startsAt: MAY_2026,
      endsAt: JUNE_2026,
    });
    expect(await store.findCurrent(MAY_2026 + 1000)).toEqual(season);
  });

  it("treats endsAt as exclusive", async () => {
    const store = new InMemorySeasonStore();
    await store.open({ name: "2026-05", startsAt: MAY_2026, endsAt: JUNE_2026 });
    expect(await store.findCurrent(JUNE_2026)).toBeNull();
  });

  it("returns the latest-starting overlapping season", async () => {
    const store = new InMemorySeasonStore();
    await store.open({ name: "2026-05", startsAt: MAY_2026, endsAt: JULY_2026 });
    const newer = await store.open({
      name: "2026-06",
      startsAt: JUNE_2026,
      endsAt: JULY_2026,
    });
    expect(await store.findCurrent(JUNE_2026 + 100)).toEqual(newer);
  });
});

describe("InMemorySeasonStore.applyMatchResult", () => {
  it("creates ratings at DEFAULT_ELO on first match", async () => {
    const store = new InMemorySeasonStore();
    const s = await store.open({ name: "S", startsAt: MAY_2026, endsAt: JUNE_2026 });
    const result = await store.applyMatchResult({
      seasonId: s.id,
      winnerUserId: "u_a",
      loserUserId: "u_b",
    });
    expect(result.winner.elo).toBe(DEFAULT_ELO + 16);
    expect(result.loser.elo).toBe(DEFAULT_ELO - 16);
    expect(result.winner.wins).toBe(1);
    expect(result.winner.losses).toBe(0);
    expect(result.loser.wins).toBe(0);
    expect(result.loser.losses).toBe(1);
  });

  it("compounds rating updates across matches", async () => {
    const store = new InMemorySeasonStore();
    const s = await store.open({ name: "S", startsAt: MAY_2026, endsAt: JUNE_2026 });
    await store.applyMatchResult({
      seasonId: s.id,
      winnerUserId: "u_a",
      loserUserId: "u_b",
    });
    const result = await store.applyMatchResult({
      seasonId: s.id,
      winnerUserId: "u_a",
      loserUserId: "u_b",
    });
    expect(result.winner.wins).toBe(2);
    expect(result.loser.losses).toBe(2);
    expect(result.winner.elo).toBeGreaterThan(DEFAULT_ELO + 16);
  });

  it("throws on unknown season", async () => {
    const store = new InMemorySeasonStore();
    await expect(
      store.applyMatchResult({ seasonId: "nope", winnerUserId: "a", loserUserId: "b" }),
    ).rejects.toThrow(/unknown season/);
  });
});

describe("InMemorySeasonStore.listLeaderboard", () => {
  it("returns entries sorted by elo desc with rank", async () => {
    const store = new InMemorySeasonStore();
    const s = await store.open({ name: "S", startsAt: MAY_2026, endsAt: JUNE_2026 });
    await store.applyMatchResult({ seasonId: s.id, winnerUserId: "u_a", loserUserId: "u_b" });
    await store.applyMatchResult({ seasonId: s.id, winnerUserId: "u_a", loserUserId: "u_c" });
    await store.applyMatchResult({ seasonId: s.id, winnerUserId: "u_c", loserUserId: "u_b" });
    const lb = await store.listLeaderboard(s.id, { limit: 10, offset: 0 });
    expect(lb.total).toBe(3);
    expect(lb.entries.map((e) => e.userId)).toEqual(["u_a", "u_c", "u_b"]);
    expect(lb.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(lb.entries[0]!.wins).toBe(2);
  });

  it("paginates with offset/limit", async () => {
    const store = new InMemorySeasonStore();
    const s = await store.open({ name: "S", startsAt: MAY_2026, endsAt: JUNE_2026 });
    for (let i = 0; i < 5; i++) {
      await store.applyMatchResult({
        seasonId: s.id,
        winnerUserId: `u_${i}`,
        loserUserId: "u_loser",
      });
    }
    const page1 = await store.listLeaderboard(s.id, { limit: 2, offset: 0 });
    const page2 = await store.listLeaderboard(s.id, { limit: 2, offset: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page2.entries).toHaveLength(2);
    expect(page1.entries[0]!.rank).toBe(1);
    expect(page2.entries[0]!.rank).toBe(3);
    expect(page1.total).toBe(6);
  });

  it("clamps invalid pagination values", async () => {
    const store = new InMemorySeasonStore();
    const s = await store.open({ name: "S", startsAt: MAY_2026, endsAt: JUNE_2026 });
    await store.applyMatchResult({ seasonId: s.id, winnerUserId: "u_a", loserUserId: "u_b" });
    const lb = await store.listLeaderboard(s.id, { limit: 0, offset: -5 });
    expect(lb.entries[0]!.rank).toBe(1);
    expect(lb.entries).toHaveLength(1);
  });

  it("isolates per-season leaderboards", async () => {
    const store = new InMemorySeasonStore();
    const s1 = await store.open({ name: "S1", startsAt: MAY_2026, endsAt: JUNE_2026 });
    const s2 = await store.open({ name: "S2", startsAt: JUNE_2026, endsAt: JULY_2026 });
    await store.applyMatchResult({ seasonId: s1.id, winnerUserId: "u_a", loserUserId: "u_b" });
    const lb2 = await store.listLeaderboard(s2.id, { limit: 10, offset: 0 });
    expect(lb2.total).toBe(0);
  });
});
