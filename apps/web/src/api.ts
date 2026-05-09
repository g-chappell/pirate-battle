import type { Action, BattleState } from "@pirate-battle/core";

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

async function request<T>(
  url: string,
  init?: RequestInit & { allow401?: boolean },
): Promise<T> {
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
  if (!res.ok)
    throw new ApiError(`/me failed: ${res.status}`, res.status, null);
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

export async function submitWalletAuth(
  body: WalletAuthBody,
): Promise<UserSummary> {
  return request<UserSummary>("/api/auth/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createCaptain(
  payload: CreateCaptainPayload,
): Promise<CaptainSummary> {
  return request<CaptainSummary>("/api/captain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function submitBattleAction(
  battleId: string,
  action: Action,
): Promise<BattleActionResponse> {
  return request<BattleActionResponse>(
    `/api/battle/${encodeURIComponent(battleId)}/action`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    },
  );
}
