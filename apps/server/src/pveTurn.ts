import { aiPickAction, createRng, DEFAULT_LEVEL, resolveTurn, xpReward } from "@pirate-battle/core";

import { parseAction, validateAction } from "./battleAction.js";
import type { BattleStore, BattleSummary } from "./battleStore.js";
import { DROP_TABLES, difficultyForOpponentLevel, rollDrops } from "./itemDrops.js";
import type { CaptainTeam, UserStore, XpAward } from "./userStore.js";

export type ApplyTurnResult =
  | { ok: true; summary: BattleSummary }
  | { ok: false; code: number; error: string };

export interface ApplyTurnArgs {
  userStore: UserStore;
  battleStore: BattleStore;
  summary: BattleSummary;
  rawAction: unknown;
}

export async function applyAuthorizedPveTurn(args: ApplyTurnArgs): Promise<ApplyTurnResult> {
  const { userStore, battleStore, summary } = args;
  if (summary.state.winner !== null) {
    return { ok: false, code: 409, error: "battle_ended" };
  }
  const parsed = parseAction(args.rawAction);
  if ("error" in parsed) {
    return { ok: false, code: 400, error: parsed.error };
  }
  const validation = validateAction(parsed, summary.state, "A");
  if (!validation.ok) {
    return { ok: false, code: 400, error: validation.error };
  }
  const aiAction = aiPickAction(summary.state, "B");
  const rng = createRng(summary.state.rngState);
  const newState = resolveTurn(summary.state, parsed, aiAction, rng);
  const newEvents = newState.log.slice(summary.state.log.length);
  const updated = await battleStore.recordTurn(summary.id, newState, newEvents);

  const justEnded = summary.state.winner === null && newState.winner !== null;
  if (justEnded && summary.captainId) {
    await grantXpForBattleEnd({
      userStore,
      userId: summary.ownerUserId,
      captainId: summary.captainId,
      playerWon: newState.winner === "A",
    });
    if (newState.winner === "A") {
      await grantDropsForBattleWin({
        userStore,
        userId: summary.ownerUserId,
        opponentLevel: DEFAULT_LEVEL,
        rngSeed: newState.rngState,
      });
    }
  }
  return { ok: true, summary: updated };
}

interface GrantDropsInput {
  userStore: UserStore;
  userId: string;
  opponentLevel: number;
  rngSeed: number;
}

export async function grantDropsForBattleWin(input: GrantDropsInput): Promise<string[]> {
  const table = DROP_TABLES[difficultyForOpponentLevel(input.opponentLevel)];
  const drops = rollDrops(table, createRng(input.rngSeed));
  for (const templateKey of drops) {
    await input.userStore.grantItems(input.userId, templateKey, 1);
  }
  return drops;
}

interface GrantXpInput {
  userStore: UserStore;
  userId: string;
  captainId: string;
  playerWon: boolean;
}

async function grantXpForBattleEnd(input: GrantXpInput): Promise<void> {
  const team = await input.userStore.getCaptainTeam(input.userId, input.captainId);
  if (!team) return;
  const awards = computeXpAwards({ team, playerWon: input.playerWon });
  if (awards.length === 0) return;
  await input.userStore.applyXpRewards(awards);
}

interface ComputeAwardsInput {
  team: CaptainTeam;
  playerWon: boolean;
  opponentLevel?: number;
}

export function computeXpAwards(input: ComputeAwardsInput): XpAward[] {
  const opponentLevel = input.opponentLevel ?? DEFAULT_LEVEL;
  const xpGain = xpReward({ won: input.playerWon, opponentLevel });
  if (xpGain <= 0) return [];
  const awards: XpAward[] = [];
  for (const crew of input.team.crews) {
    if (typeof crew.id === "string") {
      awards.push({ crewId: crew.id, xpGain });
    }
  }
  return awards;
}
