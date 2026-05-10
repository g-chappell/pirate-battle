import { describe, expect, it } from "vitest";

import { ITEMS, ITEMS_BY_KEY, TRAINING_CHIP_KEY } from "./items.js";

describe("items", () => {
  it("exposes the training-chip template", () => {
    const chip = ITEMS_BY_KEY[TRAINING_CHIP_KEY];
    expect(chip).toBeDefined();
    expect(chip?.name).toBe("Training Chip");
  });

  it("has unique templateKeys", () => {
    const keys = ITEMS.map((i) => i.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
