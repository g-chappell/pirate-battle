import type { BattleState } from "@pirate-battle/core";
import { describe, expect, it } from "vitest";

import type { PvpBattleListItem } from "./api";
import {
  battleStatusLabel,
  challengeUrl,
  formatExpiry,
  queueStatusLabel,
  readChallengeFromUrl,
  sortBattlesYouFirst,
} from "./pvpView";

function makeState(over: Partial<BattleState> = {}): BattleState {
  return {
    turn: 1,
    activeA: {} as never,
    activeB: {} as never,
    benchA: [],
    benchB: [],
    pendingSwapA: false,
    pendingSwapB: false,
    log: [],
    winner: null,
    rngSeed: 1,
    rngState: 1,
    ...over,
  };
}

function makeBattle(over: Partial<PvpBattleListItem> = {}): PvpBattleListItem {
  return {
    id: "b1",
    state: makeState(),
    yourSide: "A",
    pendingYou: false,
    pendingOpponent: false,
    pendingSubmitAt: null,
    ...over,
  };
}

describe("challengeUrl", () => {
  it("appends challenge query param to the origin", () => {
    expect(challengeUrl("https://example.com", "abc-123")).toBe(
      "https://example.com/?challenge=abc-123",
    );
  });

  it("strips trailing slash from origin", () => {
    expect(challengeUrl("https://example.com/", "tok")).toBe("https://example.com/?challenge=tok");
  });

  it("encodes tokens with special characters", () => {
    expect(challengeUrl("https://x", "a/b c")).toBe("https://x/?challenge=a%2Fb%20c");
  });
});

describe("readChallengeFromUrl", () => {
  it("extracts the challenge token from a query string", () => {
    expect(readChallengeFromUrl("?challenge=abc")).toBe("abc");
  });

  it("handles query strings without leading ?", () => {
    expect(readChallengeFromUrl("challenge=zz")).toBe("zz");
  });

  it("returns null when missing", () => {
    expect(readChallengeFromUrl("")).toBeNull();
    expect(readChallengeFromUrl("?foo=bar")).toBeNull();
    expect(readChallengeFromUrl("?challenge=")).toBeNull();
  });
});

describe("battleStatusLabel", () => {
  it("labels your move when only opponent submitted", () => {
    const label = battleStatusLabel(makeBattle({ pendingOpponent: true }));
    expect(label).toEqual({ text: "your move pending", tone: "you" });
  });

  it("labels their move when only you submitted", () => {
    const label = battleStatusLabel(makeBattle({ pendingYou: true }));
    expect(label).toEqual({ text: "their move pending", tone: "opponent" });
  });

  it("labels resolving when both submitted", () => {
    const label = battleStatusLabel(makeBattle({ pendingYou: true, pendingOpponent: true }));
    expect(label).toEqual({ text: "resolving turn", tone: "neutral" });
  });

  it("labels your move when fresh battle (no one submitted)", () => {
    const label = battleStatusLabel(makeBattle());
    expect(label).toEqual({ text: "your move pending", tone: "you" });
  });

  it("labels ended battles by winner", () => {
    const won = battleStatusLabel(makeBattle({ yourSide: "A", state: makeState({ winner: "A" }) }));
    expect(won).toEqual({ text: "you won", tone: "ended" });
    const lost = battleStatusLabel(
      makeBattle({ yourSide: "A", state: makeState({ winner: "B" }) }),
    );
    expect(lost).toEqual({ text: "you lost", tone: "ended" });
  });
});

describe("sortBattlesYouFirst", () => {
  it("puts your-turn battles before waiting-on-opponent before ended", () => {
    const yours = makeBattle({ id: "yours", pendingOpponent: true });
    const waiting = makeBattle({ id: "waiting", pendingYou: true });
    const ended = makeBattle({ id: "ended", state: makeState({ winner: "A" }) });
    const sorted = sortBattlesYouFirst([waiting, ended, yours]);
    expect(sorted.map((b) => b.id)).toEqual(["yours", "waiting", "ended"]);
  });
});

describe("formatExpiry", () => {
  it("renders expired when past", () => {
    expect(formatExpiry(100, 200)).toBe("expired");
  });

  it("renders minutes under an hour", () => {
    expect(formatExpiry(15 * 60_000, 0)).toBe("15 min");
  });

  it("renders <1 min for very small windows", () => {
    expect(formatExpiry(30_000, 0)).toBe("<1 min");
  });

  it("renders hours and minutes when over an hour", () => {
    expect(formatExpiry(2 * 60 * 60_000 + 30 * 60_000, 0)).toBe("2h 30m");
  });

  it("omits minutes when exact hour", () => {
    expect(formatExpiry(3 * 60 * 60_000, 0)).toBe("3h");
  });
});

describe("queueStatusLabel", () => {
  it("idle when not queued", () => {
    expect(queueStatusLabel({ status: "idle" }, 0)).toEqual({
      text: "Not in queue",
      matched: false,
      battleId: null,
    });
  });

  it("shows elapsed seconds when queued", () => {
    expect(queueStatusLabel({ status: "queued", joinedAt: 1000 }, 6000)).toEqual({
      text: "Searching… (5s)",
      matched: false,
      battleId: null,
    });
  });

  it("flags matched with battleId", () => {
    expect(queueStatusLabel({ status: "matched", battleId: "b9" }, 0)).toEqual({
      text: "Match found!",
      matched: true,
      battleId: "b9",
    });
  });
});
