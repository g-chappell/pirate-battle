import {
  AFFINITY_RUNE_KEYS,
  ITEMS_BY_KEY,
  MINOR_POTION_KEY,
  RARE_TOKEN_KEY,
  TRAINING_CHIP_KEY,
} from "@pirate-battle/content";
import { describe, expect, it } from "vitest";

import type { CaptainSummary, CaptainTeamApi, InventoryEntryApi } from "./api";
import {
  applyInventoryOptimistic,
  buildCrewPickerOptions,
  getItemUseMode,
  getTrainingChipQty,
  groupInventoryByKind,
  reconcileInventoryAfterApply,
} from "./inventoryView.js";

describe("getItemUseMode", () => {
  it("redirects training chips", () => {
    expect(getItemUseMode(ITEMS_BY_KEY[TRAINING_CHIP_KEY])).toBe("training-redirect");
  });

  it("flags potions and runes as needing a crew target", () => {
    expect(getItemUseMode(ITEMS_BY_KEY[MINOR_POTION_KEY])).toBe("needs-crew");
    expect(getItemUseMode(ITEMS_BY_KEY[AFFINITY_RUNE_KEYS.kraken])).toBe("needs-crew");
  });

  it("flags tokens as crew-less", () => {
    expect(getItemUseMode(ITEMS_BY_KEY[RARE_TOKEN_KEY])).toBe("no-crew");
  });

  it("returns unknown for nulls", () => {
    expect(getItemUseMode(null)).toBe("unknown");
  });
});

describe("groupInventoryByKind", () => {
  it("groups by kind in canonical order, drops zero-qty entries, sorts by template name", () => {
    const inv: InventoryEntryApi[] = [
      { templateKey: AFFINITY_RUNE_KEYS.phantom, qty: 1 },
      { templateKey: TRAINING_CHIP_KEY, qty: 4 },
      { templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 2 },
      { templateKey: MINOR_POTION_KEY, qty: 0 },
      { templateKey: "mystery-relic", qty: 1 },
      { templateKey: RARE_TOKEN_KEY, qty: 3 },
    ];
    const groups = groupInventoryByKind(inv);
    expect(groups.map((g) => g.kind)).toEqual(["training-chip", "rune", "token", "unknown"]);
    const runeGroup = groups.find((g) => g.kind === "rune")!;
    expect(runeGroup.items.map((i) => i.templateKey)).toEqual([
      AFFINITY_RUNE_KEYS.kraken,
      AFFINITY_RUNE_KEYS.phantom,
    ]);
    expect(runeGroup.label).toBe("Affinity Runes");
    const unknown = groups.find((g) => g.kind === "unknown")!;
    const first = unknown.items[0]!;
    expect(first.template).toBeNull();
    expect(first.useMode).toBe("unknown");
  });

  it("returns empty array for empty inventory", () => {
    expect(groupInventoryByKind([])).toEqual([]);
  });
});

describe("applyInventoryOptimistic", () => {
  const inv: InventoryEntryApi[] = [
    { templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 2 },
    { templateKey: MINOR_POTION_KEY, qty: 1 },
  ];

  it("decrements the matching entry and keeps order sorted by key", () => {
    const next = applyInventoryOptimistic(inv, AFFINITY_RUNE_KEYS.kraken, -1);
    expect(next).toEqual([
      { templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 1 },
      { templateKey: MINOR_POTION_KEY, qty: 1 },
    ]);
  });

  it("drops entries whose qty reaches zero", () => {
    const next = applyInventoryOptimistic(inv, MINOR_POTION_KEY, -1);
    expect(next).toEqual([{ templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 2 }]);
  });

  it("returns input unchanged for an unknown key when decrementing", () => {
    const next = applyInventoryOptimistic(inv, "ghost", -1);
    expect(next).toEqual(inv.slice().sort((a, b) => a.templateKey.localeCompare(b.templateKey)));
  });
});

describe("reconcileInventoryAfterApply", () => {
  it("replaces the entry with the server-reported remaining qty", () => {
    const inv: InventoryEntryApi[] = [
      { templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 0 },
      { templateKey: MINOR_POTION_KEY, qty: 1 },
    ];
    const next = reconcileInventoryAfterApply(inv, AFFINITY_RUNE_KEYS.kraken, 5);
    expect(next).toContainEqual({ templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 5 });
    expect(next).toHaveLength(2);
  });

  it("drops the entry when the server reports zero", () => {
    const inv: InventoryEntryApi[] = [
      { templateKey: AFFINITY_RUNE_KEYS.kraken, qty: 1 },
      { templateKey: MINOR_POTION_KEY, qty: 1 },
    ];
    const next = reconcileInventoryAfterApply(inv, AFFINITY_RUNE_KEYS.kraken, 0);
    expect(next).toEqual([{ templateKey: MINOR_POTION_KEY, qty: 1 }]);
  });
});

describe("buildCrewPickerOptions", () => {
  const captain: CaptainSummary = { id: "cap-1", name: "Ahab", factionId: "OTK" };

  it("returns [] when team is null", () => {
    expect(buildCrewPickerOptions(captain, null)).toEqual([]);
  });

  it("maps every crew to a picker option", () => {
    const team: CaptainTeamApi = {
      captainId: captain.id,
      name: captain.name,
      factionId: captain.factionId,
      inventory: [],
      crews: [
        {
          id: "c1",
          templateKey: "tide_brawler",
          level: 50,
          xp: 0,
          moveKeys: [],
          attrs: null,
        },
        {
          id: "c2",
          templateKey: "ironclad_grenadier",
          level: 60,
          xp: 0,
          moveKeys: [],
          attrs: null,
        },
      ],
    };
    const options = buildCrewPickerOptions(captain, team);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      captainId: "cap-1",
      captainName: "Ahab",
      crewId: "c1",
      templateKey: "tide_brawler",
      level: 50,
    });
  });
});

describe("getTrainingChipQty", () => {
  it("returns 0 when no chips are present", () => {
    expect(getTrainingChipQty([])).toBe(0);
    expect(getTrainingChipQty([{ templateKey: "other", qty: 3 }])).toBe(0);
  });

  it("returns the qty when chips are present", () => {
    expect(getTrainingChipQty([{ templateKey: TRAINING_CHIP_KEY, qty: 7 }])).toBe(7);
  });
});
