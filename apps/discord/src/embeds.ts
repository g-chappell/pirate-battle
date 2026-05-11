import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import type { BattleState, CrewSnapshot } from "@pirate-battle/core";
import type { APIEmbed } from "discord.js";

import type { CaptainSummary, CaptainTeam, StatsResponse } from "./serverClient.js";

const EMBED_COLOR = 0x0a4f6e;

const FACTION_ICON: Record<string, string> = {
  kraken: "🦑",
  ironbound: "⚙️",
  wraith: "👻",
  crimson: "🩸",
};

function factionLabel(factionId: string): string {
  const icon = FACTION_ICON[factionId] ?? "🏴‍☠️";
  return `${icon} ${capitalize(factionId)}`;
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function crewDisplayName(templateKey: string): string {
  return CREWS_BY_KEY[templateKey]?.name ?? templateKey;
}

function moveDisplayName(moveKey: string): string {
  return MOVES_BY_KEY[moveKey]?.name ?? moveKey;
}

export function buildTeamEmbed(team: CaptainTeam): APIEmbed {
  const fields = team.crews.map((c) => {
    const level = c.level ?? 1;
    const moves = c.moveKeys.map(moveDisplayName).join(", ");
    return {
      name: `${crewDisplayName(c.templateKey)} — Lv ${level}`,
      value: moves.length > 0 ? `Moves: ${moves}` : "_No moves assigned_",
    };
  });
  return {
    title: `Captain ${team.name}`,
    description: factionLabel(team.factionId),
    color: EMBED_COLOR,
    fields,
  };
}

export function buildCaptainListEmbed(captains: readonly CaptainSummary[]): APIEmbed {
  if (captains.length === 0) {
    return {
      title: "No captains yet",
      description:
        "You haven't built a captain on the web yet. Visit Pirate-Battle, pick a starter team, then come back to play in Discord.",
      color: EMBED_COLOR,
    };
  }
  return {
    title: "Choose a captain",
    description: "You command multiple captains — `/team` shows the first one for now.",
    color: EMBED_COLOR,
    fields: captains.slice(0, 10).map((c) => ({
      name: c.name,
      value: factionLabel(c.factionId),
    })),
  };
}

function crewLineForBattle(c: CrewSnapshot): string {
  return `${crewDisplayName(c.templateKey)} (Lv ${c.level}, HP ${c.hp}/${c.maxHp})`;
}

export function buildBattleStartEmbed(args: {
  captainName: string;
  state: BattleState;
  battleId: string;
}): APIEmbed {
  const { state } = args;
  const teamA = [state.activeA, ...state.benchA].map(crewLineForBattle).join("\n");
  const teamB = [state.activeB, ...state.benchB].map(crewLineForBattle).join("\n");
  return {
    title: `⚔️ Battle started — ${args.captainName} vs AI`,
    description: `Battle ID \`${args.battleId}\`. Use \`/move\` and \`/switch\` to take your turn.`,
    color: EMBED_COLOR,
    fields: [
      { name: "Your active", value: crewLineForBattle(state.activeA) },
      { name: "Opponent active", value: crewLineForBattle(state.activeB) },
      { name: `Your team (${state.benchA.length + 1})`, value: teamA },
      { name: `Opponent team (${state.benchB.length + 1})`, value: teamB },
    ],
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function buildStatsEmbed(stats: StatsResponse, opts: { isSelf: boolean }): APIEmbed {
  const u = stats.user;
  const subject = opts.isSelf ? "Your record" : `<@${stats.discordUserId}>'s record`;
  if (u.totalBattles === 0) {
    return {
      title: subject,
      description: opts.isSelf
        ? "No finished battles yet. Try `/battle opponent:ai` to start one."
        : "This captain hasn't finished any battles yet.",
      color: EMBED_COLOR,
    };
  }
  return {
    title: subject,
    color: EMBED_COLOR,
    fields: [
      { name: "Total battles", value: String(u.totalBattles), inline: true },
      { name: "Wins", value: String(u.wins), inline: true },
      { name: "Losses", value: String(u.losses), inline: true },
      { name: "Win rate", value: formatPercent(u.winRate), inline: true },
      { name: "Avg turns", value: u.avgTurns.toFixed(1), inline: true },
    ],
  };
}
