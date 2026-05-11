import { describe, expect, it } from "vitest";

import type { LeaderboardEntry } from "./api";
import {
  clampOffset,
  formatPageLabel,
  formatSeasonWindow,
  formatUserShort,
  pageInfoFromResponse,
} from "./leaderboardView";

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    userId: "user_abc",
    elo: 1000,
    wins: 0,
    losses: 0,
    rank: 1,
    ...over,
  };
}

describe("pageInfoFromResponse", () => {
  it("derives a 1-based pageStart/pageEnd from offset + entries length", () => {
    const info = pageInfoFromResponse({
      entries: [entry({ rank: 26 }), entry({ rank: 27 })],
      total: 100,
      limit: 25,
      offset: 25,
    });
    expect(info.pageStart).toBe(26);
    expect(info.pageEnd).toBe(27);
  });

  it("reports zeros when entries are empty", () => {
    const info = pageInfoFromResponse({ entries: [], total: 0, limit: 25, offset: 0 });
    expect(info.pageStart).toBe(0);
    expect(info.pageEnd).toBe(0);
    expect(info.hasPrev).toBe(false);
    expect(info.hasNext).toBe(false);
  });

  it("has next when offset + limit < total", () => {
    const info = pageInfoFromResponse({
      entries: [entry()],
      total: 100,
      limit: 25,
      offset: 0,
    });
    expect(info.hasNext).toBe(true);
    expect(info.hasPrev).toBe(false);
  });

  it("has prev but not next on the last page", () => {
    const info = pageInfoFromResponse({
      entries: [entry()],
      total: 100,
      limit: 25,
      offset: 75,
    });
    expect(info.hasPrev).toBe(true);
    expect(info.hasNext).toBe(false);
  });
});

describe("clampOffset", () => {
  it("returns 0 for negative or non-finite offsets", () => {
    expect(clampOffset(-5, 100, 25)).toBe(0);
    expect(clampOffset(Number.NaN, 100, 25)).toBe(0);
  });

  it("returns 0 when total is zero", () => {
    expect(clampOffset(50, 0, 25)).toBe(0);
  });

  it("clamps to the last full page when offset exceeds total", () => {
    expect(clampOffset(500, 100, 25)).toBe(75);
  });

  it("floors fractional offsets", () => {
    expect(clampOffset(26.7, 100, 25)).toBe(26);
  });
});

describe("formatUserShort", () => {
  it("returns the userId untouched when short", () => {
    expect(formatUserShort("u_123")).toBe("u_123");
  });

  it("truncates long userIds with an ellipsis", () => {
    expect(formatUserShort("user_abcdefghijklmnop")).toBe("user_abcde…");
  });
});

describe("formatPageLabel", () => {
  it("returns an empty-state message when total is zero", () => {
    const info = pageInfoFromResponse({ entries: [], total: 0, limit: 25, offset: 0 });
    expect(formatPageLabel(info)).toMatch(/No captains/);
  });

  it("renders the inclusive range and total when entries exist", () => {
    const info = pageInfoFromResponse({
      entries: [entry({ rank: 1 }), entry({ rank: 2 })],
      total: 42,
      limit: 25,
      offset: 0,
    });
    expect(formatPageLabel(info)).toBe("Showing 1–2 of 42");
  });
});

describe("formatSeasonWindow", () => {
  it("renders both bounds as YYYY-MM-DD in UTC", () => {
    expect(formatSeasonWindow(0, 86_400_000)).toBe("1970-01-01 → 1970-01-02");
  });
});
