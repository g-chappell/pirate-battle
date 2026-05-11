import type { BattleEvent, BattleState, Side } from "@pirate-battle/core";

export interface FinishedBattleStats {
  state: BattleState;
  userSide: Side;
  events: readonly BattleEvent[];
}

export interface UserStats {
  totalBattles: number;
  wins: number;
  losses: number;
  winRate: number;
  avgTurns: number;
}

export interface CrewStats {
  templateKey: string;
  participated: number;
  wins: number;
  losses: number;
  finishingBlows: number;
  deaths: number;
  teamKills: number;
  teamDeaths: number;
}

export function computeUserStats(battles: readonly FinishedBattleStats[]): UserStats {
  let wins = 0;
  let losses = 0;
  let turnSum = 0;
  let counted = 0;
  for (const b of battles) {
    if (b.state.winner === null) continue;
    if (b.state.winner === b.userSide) wins++;
    else losses++;
    turnSum += b.state.turn;
    counted++;
  }
  return {
    totalBattles: counted,
    wins,
    losses,
    winRate: counted === 0 ? 0 : wins / counted,
    avgTurns: counted === 0 ? 0 : turnSum / counted,
  };
}

function userTeamFromState(state: BattleState, userSide: Side) {
  return userSide === "A" ? [state.activeA, ...state.benchA] : [state.activeB, ...state.benchB];
}

function userActive(state: BattleState, userSide: Side) {
  return userSide === "A" ? state.activeA : state.activeB;
}

export function computeCrewStats(
  battles: readonly FinishedBattleStats[],
  templateKey: string,
): CrewStats {
  let participated = 0;
  let wins = 0;
  let losses = 0;
  let finishingBlows = 0;
  let deaths = 0;
  let teamKills = 0;
  let teamDeaths = 0;

  for (const b of battles) {
    if (b.state.winner === null) continue;
    const userTeam = userTeamFromState(b.state, b.userSide);
    const onTeam = userTeam.some((c) => c.templateKey === templateKey);
    if (!onTeam) continue;

    participated++;
    if (b.state.winner === b.userSide) {
      wins++;
      const active = userActive(b.state, b.userSide);
      if (active.templateKey === templateKey) finishingBlows++;
    } else {
      losses++;
    }

    for (const c of userTeam) {
      if (c.templateKey === templateKey && c.hp === 0) deaths++;
    }

    const opposingSide: Side = b.userSide === "A" ? "B" : "A";
    for (const ev of b.events) {
      if (ev.kind !== "faint") continue;
      if (ev.side === opposingSide) teamKills++;
      else if (ev.side === b.userSide) teamDeaths++;
    }
  }

  return {
    templateKey,
    participated,
    wins,
    losses,
    finishingBlows,
    deaths,
    teamKills,
    teamDeaths,
  };
}
