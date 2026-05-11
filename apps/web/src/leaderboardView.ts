import type { LeaderboardEntry } from "./api";

export const LEADERBOARD_DEFAULT_PAGE_SIZE = 25;
export const LEADERBOARD_MAX_PAGE_SIZE = 100;

export interface LeaderboardPageInfo {
  pageStart: number;
  pageEnd: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageInfoFromResponse(args: {
  entries: readonly LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
}): LeaderboardPageInfo {
  const { entries, total, limit, offset } = args;
  const pageStart = entries.length === 0 ? 0 : offset + 1;
  const pageEnd = entries.length === 0 ? 0 : offset + entries.length;
  return {
    pageStart,
    pageEnd,
    total,
    hasPrev: offset > 0,
    hasNext: offset + limit < total,
  };
}

export function clampOffset(offset: number, total: number, limit: number): number {
  if (!Number.isFinite(offset) || offset < 0) return 0;
  if (total <= 0) return 0;
  const maxOffset = Math.max(0, Math.floor((total - 1) / limit) * limit);
  return Math.min(Math.floor(offset), maxOffset);
}

export function formatUserShort(userId: string): string {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 10)}…`;
}

export function formatPageLabel(info: LeaderboardPageInfo): string {
  if (info.total === 0) return "No captains ranked yet";
  return `Showing ${info.pageStart}–${info.pageEnd} of ${info.total}`;
}

export function formatSeasonWindow(startsAt: number, endsAt: number): string {
  const start = formatDateOnly(startsAt);
  const end = formatDateOnly(endsAt);
  return `${start} → ${end}`;
}

function formatDateOnly(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}
