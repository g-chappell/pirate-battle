import { describe, expect, it } from "vitest";

import { applyElo, DEFAULT_ELO, DEFAULT_K_FACTOR } from "./elo.js";

describe("applyElo", () => {
  it("uses K=32 by default", () => {
    expect(DEFAULT_K_FACTOR).toBe(32);
  });

  it("awards 16 points to the winner when ratings are equal", () => {
    const r = applyElo(1000, 1000);
    expect(r.delta).toBe(16);
    expect(r.newWinnerRating).toBe(1016);
    expect(r.newLoserRating).toBe(984);
  });

  it("is zero-sum (winner gain == loser loss)", () => {
    const r = applyElo(1450, 1320);
    expect(r.newWinnerRating - 1450).toBe(1320 - r.newLoserRating);
  });

  it("gives the underdog more points when they win", () => {
    const underdogWin = applyElo(800, 1200);
    const favoriteWin = applyElo(1200, 800);
    expect(underdogWin.delta).toBeGreaterThan(favoriteWin.delta);
    expect(underdogWin.delta).toBeGreaterThan(DEFAULT_K_FACTOR / 2);
    expect(favoriteWin.delta).toBeLessThan(DEFAULT_K_FACTOR / 2);
  });

  it("respects the provided K factor", () => {
    const r = applyElo(1000, 1000, 16);
    expect(r.delta).toBe(8);
  });

  it("starting at DEFAULT_ELO produces symmetric outcomes", () => {
    const r = applyElo(DEFAULT_ELO, DEFAULT_ELO);
    expect(r.newWinnerRating + r.newLoserRating).toBe(2 * DEFAULT_ELO);
  });
});
