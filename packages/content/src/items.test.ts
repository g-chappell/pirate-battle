import { describe, expect, it } from "vitest";

import {
  AFFINITY_RUNE_KEYS,
  ITEMS,
  ITEMS_BY_KEY,
  MINOR_POTION_KEY,
  RARE_TOKEN_KEY,
  TRAINING_CHIP_KEY,
} from "./items.js";

describe("items", () => {
  it("exposes the seven starter templates (chip + potion + 4 runes + token)", () => {
    expect(ITEMS).toHaveLength(7);
  });

  it("exposes the training-chip template with kind 'training-chip'", () => {
    const chip = ITEMS_BY_KEY[TRAINING_CHIP_KEY];
    expect(chip).toBeDefined();
    expect(chip?.name).toBe("Training Chip");
    expect(chip?.kind).toBe("training-chip");
  });

  it("exposes the minor-potion + rare-token templates", () => {
    expect(ITEMS_BY_KEY[MINOR_POTION_KEY]?.kind).toBe("potion");
    expect(ITEMS_BY_KEY[RARE_TOKEN_KEY]?.kind).toBe("token");
  });

  it("exposes one rune per affinity", () => {
    for (const affinity of ["kraken", "ironclad", "phantom", "bloodborne"] as const) {
      const key = AFFINITY_RUNE_KEYS[affinity];
      const tpl = ITEMS_BY_KEY[key];
      expect(tpl?.kind).toBe("rune");
      expect(tpl?.affinity).toBe(affinity);
    }
  });

  it("has unique templateKeys", () => {
    const keys = ITEMS.map((i) => i.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
