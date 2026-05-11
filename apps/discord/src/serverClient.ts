import type { Action, BattleState } from "@pirate-battle/core";

export interface CaptainSummary {
  id: string;
  name: string;
  factionId: string;
}

export interface CaptainTeamCrew {
  id?: string | null;
  templateKey: string;
  moveKeys: string[];
  level?: number;
  xp?: number;
  attrs?: Record<string, number> | null;
}

export interface CaptainTeam {
  id: string;
  name: string;
  factionId: string;
  crews: CaptainTeamCrew[];
}

export interface MeResponse {
  user: {
    id: string;
    stakeAddr: string | null;
    captains: CaptainSummary[];
  };
}

export interface TeamResponse {
  captain: CaptainTeam;
}

export interface BattleResponse {
  id: string;
  state: BattleState;
  captainName: string;
}

export interface ActiveBattleResponse {
  id: string;
  state: BattleState;
}

export interface ActionResponse {
  id: string;
  state: BattleState;
}

export interface StatsResponse {
  user: {
    totalBattles: number;
    wins: number;
    losses: number;
    winRate: number;
    avgTurns: number;
  };
  discordUserId: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; reason: string };

export interface ApiCallEnv {
  serverUrl: string;
  fetchImpl?: typeof fetch;
}

export async function fetchMe(
  env: ApiCallEnv,
  discordUserId: string,
): Promise<ApiResult<MeResponse>> {
  const url = new URL("/api/discord/me", env.serverUrl);
  url.searchParams.set("discordUserId", discordUserId);
  return request<MeResponse>(env.fetchImpl ?? fetch, url.toString(), { method: "GET" });
}

export async function fetchTeam(
  env: ApiCallEnv,
  discordUserId: string,
  captainId: string,
): Promise<ApiResult<TeamResponse>> {
  const url = new URL("/api/discord/team", env.serverUrl);
  url.searchParams.set("discordUserId", discordUserId);
  url.searchParams.set("captainId", captainId);
  return request<TeamResponse>(env.fetchImpl ?? fetch, url.toString(), { method: "GET" });
}

export async function startBattle(
  env: ApiCallEnv,
  args: { discordUserId: string; captainId: string; opponent: string },
): Promise<ApiResult<BattleResponse>> {
  const url = new URL("/api/discord/battle", env.serverUrl);
  return request<BattleResponse>(env.fetchImpl ?? fetch, url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function fetchActiveBattle(
  env: ApiCallEnv,
  discordUserId: string,
): Promise<ApiResult<ActiveBattleResponse>> {
  const url = new URL("/api/discord/battle/active", env.serverUrl);
  url.searchParams.set("discordUserId", discordUserId);
  return request<ActiveBattleResponse>(env.fetchImpl ?? fetch, url.toString(), { method: "GET" });
}

export async function submitBattleAction(
  env: ApiCallEnv,
  args: { discordUserId: string; action: Action },
): Promise<ApiResult<ActionResponse>> {
  const url = new URL("/api/discord/battle/action", env.serverUrl);
  return request<ActionResponse>(env.fetchImpl ?? fetch, url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function fetchStats(
  env: ApiCallEnv,
  discordUserId: string,
  targetDiscordUserId?: string,
): Promise<ApiResult<StatsResponse>> {
  const url = new URL("/api/discord/stats", env.serverUrl);
  url.searchParams.set("discordUserId", discordUserId);
  if (targetDiscordUserId) {
    url.searchParams.set("targetDiscordUserId", targetDiscordUserId);
  }
  return request<StatsResponse>(env.fetchImpl ?? fetch, url.toString(), { method: "GET" });
}

async function request<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    return { ok: false, status: 0, reason: "network_error" };
  }
  const body = await readJson(res);
  if (res.ok) {
    return { ok: true, data: body as T };
  }
  const reason =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : "unknown_error";
  return { ok: false, status: res.status, reason };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
