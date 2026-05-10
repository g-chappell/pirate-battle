export interface ItemTemplate {
  templateKey: string;
  name: string;
  description: string;
}

export const TRAINING_CHIP_KEY = "training-chip";

export const ITEMS: readonly ItemTemplate[] = [
  {
    templateKey: TRAINING_CHIP_KEY,
    name: "Training Chip",
    description:
      "[DRAFT] A weather-bleached chit etched with crew sigils. Spend one to push a crew member one notch sharper in atk, def, or spd.",
  },
];

export const ITEMS_BY_KEY: Readonly<Record<string, ItemTemplate>> = Object.freeze(
  Object.fromEntries(ITEMS.map((i) => [i.templateKey, i])),
);
