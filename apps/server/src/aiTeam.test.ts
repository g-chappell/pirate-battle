import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import { buildAIOpponentTeam } from "./aiTeam.js";

describe("buildAIOpponentTeam", () => {
  it("returns a 6-crew team", () => {
    const team = buildAIOpponentTeam();
    expect(team.crews).toHaveLength(6);
  });

  it("references only known crew templates and moves", () => {
    const team = buildAIOpponentTeam();
    for (const crew of team.crews) {
      expect(CREWS_BY_KEY[crew.templateKey]).toBeDefined();
      for (const moveKey of crew.moveKeys) {
        expect(MOVES_BY_KEY[moveKey]).toBeDefined();
      }
    }
  });

  it("is stable across calls (no hidden randomness)", () => {
    const a = buildAIOpponentTeam();
    const b = buildAIOpponentTeam();
    expect(a).toEqual(b);
  });
});
