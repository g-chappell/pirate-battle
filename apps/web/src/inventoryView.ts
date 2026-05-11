import {
  ITEMS_BY_KEY,
  type ItemKind,
  type ItemTemplate,
  TRAINING_CHIP_KEY,
} from "@pirate-battle/content";

import type { CaptainSummary, CaptainTeamApi, InventoryEntryApi } from "./api";

const KIND_ORDER: readonly ItemKind[] = ["training-chip", "potion", "rune", "token"];

const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  "training-chip": "Training Chips",
  potion: "Potions",
  rune: "Affinity Runes",
  token: "Tokens",
};

export type UseMode = "training-redirect" | "needs-crew" | "no-crew" | "unknown";

export interface InventoryItemView {
  templateKey: string;
  qty: number;
  template: ItemTemplate | null;
  useMode: UseMode;
}

export interface InventoryGroup {
  kind: ItemKind | "unknown";
  label: string;
  items: InventoryItemView[];
}

export interface CrewPickerOption {
  captainId: string;
  captainName: string;
  crewId: string;
  templateKey: string;
  name: string;
  level: number;
}

export function getItemUseMode(template: ItemTemplate | null | undefined): UseMode {
  if (!template) return "unknown";
  if (template.kind === "training-chip") return "training-redirect";
  if (template.kind === "potion" || template.kind === "rune") return "needs-crew";
  if (template.kind === "token") return "no-crew";
  return "unknown";
}

export function groupInventoryByKind(inventory: readonly InventoryEntryApi[]): InventoryGroup[] {
  const buckets = new Map<ItemKind | "unknown", InventoryItemView[]>();

  for (const entry of inventory) {
    if (entry.qty <= 0) continue;
    const template = ITEMS_BY_KEY[entry.templateKey] ?? null;
    const kind: ItemKind | "unknown" = template?.kind ?? "unknown";
    const view: InventoryItemView = {
      templateKey: entry.templateKey,
      qty: entry.qty,
      template,
      useMode: getItemUseMode(template),
    };
    const existing = buckets.get(kind);
    if (existing) existing.push(view);
    else buckets.set(kind, [view]);
  }

  for (const items of buckets.values()) {
    items.sort((a, b) => {
      const aName = a.template?.name ?? a.templateKey;
      const bName = b.template?.name ?? b.templateKey;
      return aName.localeCompare(bName);
    });
  }

  const groups: InventoryGroup[] = [];
  for (const kind of KIND_ORDER) {
    const items = buckets.get(kind);
    if (items && items.length > 0) {
      groups.push({ kind, label: KIND_LABEL[kind], items });
    }
  }
  const unknown = buckets.get("unknown");
  if (unknown && unknown.length > 0) {
    groups.push({ kind: "unknown", label: "Other", items: unknown });
  }
  return groups;
}

export function applyInventoryOptimistic(
  inventory: readonly InventoryEntryApi[],
  templateKey: string,
  delta: number,
): InventoryEntryApi[] {
  const next: InventoryEntryApi[] = [];
  let found = false;
  for (const entry of inventory) {
    if (entry.templateKey !== templateKey) {
      next.push(entry);
      continue;
    }
    found = true;
    const qty = entry.qty + delta;
    if (qty > 0) next.push({ templateKey, qty });
  }
  if (!found && delta > 0) next.push({ templateKey, qty: delta });
  next.sort((a, b) => a.templateKey.localeCompare(b.templateKey));
  return next;
}

export function reconcileInventoryAfterApply(
  inventory: readonly InventoryEntryApi[],
  templateKey: string,
  remaining: number,
): InventoryEntryApi[] {
  const others = inventory.filter((i) => i.templateKey !== templateKey);
  const next = remaining > 0 ? [...others, { templateKey, qty: remaining }] : others;
  next.sort((a, b) => a.templateKey.localeCompare(b.templateKey));
  return next;
}

export function buildCrewPickerOptions(
  captain: CaptainSummary,
  team: CaptainTeamApi | null,
): CrewPickerOption[] {
  if (!team) return [];
  return team.crews.map((c) => ({
    captainId: captain.id,
    captainName: captain.name,
    crewId: c.id,
    templateKey: c.templateKey,
    name: c.templateKey,
    level: c.level,
  }));
}

export function getTrainingChipQty(inventory: readonly InventoryEntryApi[]): number {
  return inventory.find((i) => i.templateKey === TRAINING_CHIP_KEY)?.qty ?? 0;
}
