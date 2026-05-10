import type { Action, BattleState, Side } from "@pirate-battle/core";

export type ParseResult = Action | { error: string };

export function parseAction(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { error: "invalid_action" };
  const a = raw as { type?: unknown };
  if (a.type === "forfeit") return { type: "forfeit" };
  if (a.type === "move") {
    const moveKey = (raw as { moveKey?: unknown }).moveKey;
    if (typeof moveKey !== "string" || moveKey.length === 0) {
      return { error: "invalid_move_key" };
    }
    return { type: "move", moveKey };
  }
  if (a.type === "switch") {
    const idx = (raw as { targetIndex?: unknown }).targetIndex;
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
      return { error: "invalid_target_index" };
    }
    return { type: "switch", targetIndex: idx };
  }
  return { error: "invalid_action_type" };
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

export function validateAction(action: Action, state: BattleState, side: Side): ValidateResult {
  const pendingSwap = side === "A" ? state.pendingSwapA : state.pendingSwapB;
  const active = side === "A" ? state.activeA : state.activeB;
  const bench = side === "A" ? state.benchA : state.benchB;

  if (pendingSwap && action.type !== "switch") {
    return { ok: false, error: "swap_required" };
  }
  if (action.type === "move") {
    const known = active.moves.some((m) => m.key === action.moveKey);
    if (!known) return { ok: false, error: "unknown_move" };
  }
  if (action.type === "switch") {
    if (action.targetIndex >= bench.length) {
      return { ok: false, error: "switch_out_of_range" };
    }
    const target = bench[action.targetIndex]!;
    if (target.hp <= 0) return { ok: false, error: "switch_to_fainted" };
  }
  return { ok: true };
}
