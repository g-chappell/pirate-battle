import type { Action, BattleState, CrewAttrs, Side, TrainableStat } from "@pirate-battle/core";

export interface CaptainSummary {
  id: string;
  name: string;
  factionId: string;
}

export interface UserSummary {
  id: string;
  stakeAddr: string | null;
  captains: CaptainSummary[];
}

export interface CreateCaptainPayload {
  name: string;
  factionId: string;
  crewTemplateKeys: string[];
}

export interface BattleActionResponse {
  state: BattleState;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit & { allow401?: boolean }): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    if (res.status === 401 && init?.allow401) {
      throw new ApiError("unauthorized", 401, "unauthorized");
    }
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") code = body.error;
    } catch {
      // ignore JSON parse failures; server may have returned a non-JSON body
    }
    throw new ApiError(
      `request failed: ${res.status}${code ? ` (${code})` : ""}`,
      res.status,
      code,
    );
  }
  return (await res.json()) as T;
}

export async function getMe(): Promise<UserSummary | null> {
  const res = await fetch("/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new ApiError(`/me failed: ${res.status}`, res.status, null);
  return (await res.json()) as UserSummary;
}

export async function createAnonymousSession(): Promise<UserSummary> {
  return request<UserSummary>("/api/session/anonymous", { method: "POST" });
}

export interface WalletAuthBody {
  stakeAddr: string;
  payloadHex: string;
  signature: string;
  key: string;
}

export async function requestNonce(): Promise<{
  nonce: string;
  expiresAt: number;
}> {
  return request<{ nonce: string; expiresAt: number }>("/api/auth/nonce", {
    method: "POST",
  });
}

export async function submitWalletAuth(body: WalletAuthBody): Promise<UserSummary> {
  return request<UserSummary>("/api/auth/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createCaptain(payload: CreateCaptainPayload): Promise<CaptainSummary> {
  return request<CaptainSummary>("/api/captain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export interface CaptainTeamCrewApi {
  id: string;
  templateKey: string;
  level: number;
  xp: number;
  moveKeys: string[];
  attrs: CrewAttrs | null;
}

export interface InventoryEntryApi {
  templateKey: string;
  qty: number;
}

export interface CaptainTeamApi {
  captainId: string;
  name: string;
  factionId: string;
  crews: CaptainTeamCrewApi[];
  inventory: InventoryEntryApi[];
}

export interface TrainCrewApiResponse {
  crew: CaptainTeamCrewApi;
  remainingChips: number;
}

export async function getCaptainTeam(captainId: string): Promise<CaptainTeamApi> {
  return request<CaptainTeamApi>(`/api/captain/${encodeURIComponent(captainId)}/team`);
}

export async function getInventory(): Promise<{ inventory: InventoryEntryApi[] }> {
  return request<{ inventory: InventoryEntryApi[] }>("/api/inventory");
}

export interface ApplyItemApiResponse {
  templateKey: string;
  applied: boolean;
  remaining: number;
}

export async function applyItem(templateKey: string): Promise<ApplyItemApiResponse> {
  return request<ApplyItemApiResponse>("/api/item/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templateKey }),
  });
}

export async function trainCrew(
  captainId: string,
  crewId: string,
  stat: TrainableStat,
): Promise<TrainCrewApiResponse> {
  return request<TrainCrewApiResponse>(
    `/api/captain/${encodeURIComponent(captainId)}/crew/${encodeURIComponent(crewId)}/train`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stat }),
    },
  );
}

export async function submitBattleAction(
  battleId: string,
  action: Action,
): Promise<BattleActionResponse> {
  return request<BattleActionResponse>(`/api/battle/${encodeURIComponent(battleId)}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
}

export interface BattleResponse {
  id: string;
  state: BattleState;
}

export async function getBattle(battleId: string): Promise<BattleResponse> {
  return request<BattleResponse>(`/api/battle/${encodeURIComponent(battleId)}`);
}

export interface FinishedBattleRow {
  id: string;
  mode: string;
  userSide: Side;
  winner: Side;
  turn: number;
  startedAt: number;
  endedAt: number;
}

export async function listBattleHistory(limit = 10): Promise<{ battles: FinishedBattleRow[] }> {
  return request<{ battles: FinishedBattleRow[] }>(
    `/api/battle/history?limit=${encodeURIComponent(String(limit))}`,
  );
}

export interface PvpChallengeIssued {
  token: string;
  expiresAt: number;
}

export interface PvpBattleView {
  id: string;
  state: BattleState;
  yourSide: Side;
  pendingYou: boolean;
  pendingOpponent: boolean;
  pendingSubmitAt: number | null;
}

export type PvpBattleListItem = PvpBattleView;

export interface PvpQueueStatus {
  status: "idle" | "queued" | "matched";
  joinedAt?: number;
  battleId?: string;
}

export interface PvpQueueJoinResult {
  status: "queued" | "matched";
  joinedAt?: number;
  battleId?: string;
  state?: BattleState;
  yourSide?: Side;
}

export interface PvpAcceptResult {
  id: string;
  state: BattleState;
  yourSide: Side;
}

export async function createPvpChallenge(captainId: string): Promise<PvpChallengeIssued> {
  return request<PvpChallengeIssued>("/api/pvp/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captainId }),
  });
}

export async function acceptPvpChallenge(
  token: string,
  captainId: string,
): Promise<PvpAcceptResult> {
  return request<PvpAcceptResult>(`/api/pvp/challenge/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captainId }),
  });
}

export async function listPvpBattles(): Promise<{ battles: PvpBattleListItem[] }> {
  return request<{ battles: PvpBattleListItem[] }>("/api/pvp/battles");
}

export async function getPvpBattle(id: string): Promise<PvpBattleView> {
  return request<PvpBattleView>(`/api/pvp/battle/${encodeURIComponent(id)}`);
}

export async function submitPvpAction(
  battleId: string,
  action: Action,
): Promise<PvpBattleView & { status: "resolved" | "waiting_opponent" }> {
  return request<PvpBattleView & { status: "resolved" | "waiting_opponent" }>(
    `/api/pvp/battle/${encodeURIComponent(battleId)}/action`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
}

export async function joinPvpQueue(captainId: string): Promise<PvpQueueJoinResult> {
  return request<PvpQueueJoinResult>("/api/pvp/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captainId }),
  });
}

export async function getPvpQueueStatus(): Promise<PvpQueueStatus> {
  return request<PvpQueueStatus>("/api/pvp/queue/status");
}

export interface LeaderboardSeason {
  id: string;
  name: string;
  startsAt: number;
  endsAt: number;
}

export interface LeaderboardEntry {
  userId: string;
  elo: number;
  wins: number;
  losses: number;
  rank: number;
}

export interface LeaderboardResponse {
  season: LeaderboardSeason;
  entries: LeaderboardEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function getCurrentSeason(): Promise<LeaderboardSeason | null> {
  try {
    return await request<LeaderboardSeason>("/api/seasons/current");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function listLeaderboard(
  seasonId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const url = `/api/leaderboard/${encodeURIComponent(seasonId)}${qs ? `?${qs}` : ""}`;
  return request<LeaderboardResponse>(url);
}
