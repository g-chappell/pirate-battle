import type { PvpBattleListItem } from "./api";

export interface BattleStatusLabel {
  text: string;
  tone: "you" | "opponent" | "neutral" | "ended";
}

export function challengeUrl(origin: string, token: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/?challenge=${encodeURIComponent(token)}`;
}

export function readChallengeFromUrl(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const t = params.get("challenge");
  return t && t.length > 0 ? t : null;
}

export function battleStatusLabel(battle: PvpBattleListItem): BattleStatusLabel {
  if (battle.state.winner !== null) {
    const youWon = battle.state.winner === battle.yourSide;
    return { text: youWon ? "you won" : "you lost", tone: "ended" };
  }
  if (battle.pendingYou && battle.pendingOpponent) {
    return { text: "resolving turn", tone: "neutral" };
  }
  if (battle.pendingYou) {
    return { text: "their move pending", tone: "opponent" };
  }
  if (battle.pendingOpponent) {
    return { text: "your move pending", tone: "you" };
  }
  return { text: "your move pending", tone: "you" };
}

export function sortBattlesYouFirst(battles: PvpBattleListItem[]): PvpBattleListItem[] {
  const priority = (b: PvpBattleListItem): number => {
    if (b.state.winner !== null) return 2;
    if (b.pendingOpponent && !b.pendingYou) return 0;
    if (!b.pendingYou) return 0;
    return 1;
  };
  return [...battles].sort((a, b) => priority(a) - priority(b));
}

export function formatExpiry(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export interface QueueStatusLabel {
  text: string;
  matched: boolean;
  battleId: string | null;
}

export function queueStatusLabel(
  status: { status: "idle" | "queued" | "matched"; battleId?: string; joinedAt?: number },
  now: number,
): QueueStatusLabel {
  if (status.status === "idle") {
    return { text: "Not in queue", matched: false, battleId: null };
  }
  if (status.status === "matched" && status.battleId) {
    return { text: "Match found!", matched: true, battleId: status.battleId };
  }
  const since = status.joinedAt ? Math.max(0, Math.floor((now - status.joinedAt) / 1000)) : 0;
  return { text: `Searching… (${since}s)`, matched: false, battleId: null };
}
