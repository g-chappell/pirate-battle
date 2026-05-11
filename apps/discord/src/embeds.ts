import { CREWS_BY_KEY, MOVES_BY_KEY } from "@pirate-battle/content";
import type { Affinity, BattleEvent, BattleState, CrewSnapshot, Side } from "@pirate-battle/core";
import { type APIEmbed, EmbedBuilder } from "discord.js";

import type {
  CaptainSummary,
  CaptainTeam,
  LeaderboardResponse,
  StatsResponse,
} from "./serverClient.js";

const EMBED_COLOR = 0x0a4f6e;

const FACTION_ICON: Record<string, string> = {
  kraken: "🦑",
  ironbound: "⚙️",
  wraith: "👻",
  crimson: "🩸",
};

const AFFINITY_EMOJI: Record<Affinity, string> = {
  kraken: "🦑",
  ironclad: "🛡️",
  phantom: "👻",
  bloodborne: "🩸",
};

export function affinityEmoji(affinity: Affinity): string {
  return AFFINITY_EMOJI[affinity];
}

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

const HP_BAR_WIDTH = 10;

function hpBar(hp: number, maxHp: number): string {
  if (maxHp <= 0) return "░".repeat(HP_BAR_WIDTH);
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const filled = Math.round(ratio * HP_BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(HP_BAR_WIDTH - filled);
}

function activeLineForBattle(c: CrewSnapshot): string {
  return `${crewDisplayName(c.templateKey)} (Lv ${c.level})\n${hpBar(c.hp, c.maxHp)} ${c.hp}/${c.maxHp}`;
}

export function formatEffectiveness(effective: number): string | null {
  if (effective > 1) return "super effective!";
  return null;
}

function formatEvent(event: BattleEvent): string | null {
  switch (event.kind) {
    case "move": {
      const actor = event.side === "A" ? "You" : "Opponent";
      const critNote = event.crit ? " (crit!)" : "";
      const eff = formatEffectiveness(event.effective);
      const effNote = eff ? ` — ${eff}` : "";
      return `${actor} used ${moveDisplayName(event.moveKey)} — ${event.damage} dmg${critNote}${effNote}`;
    }
    case "miss": {
      const actor = event.side === "A" ? "You" : "Opponent";
      return `${actor} used ${moveDisplayName(event.moveKey)} — missed`;
    }
    case "stun_skip": {
      const actor = event.side === "A" ? "You" : "Opponent";
      return `${actor} stunned — skipped turn`;
    }
    case "switch": {
      const actor = event.side === "A" ? "You" : "Opponent";
      return `${actor} switched in a new crew`;
    }
    case "faint": {
      const actor = event.side === "A" ? "Your" : "Opponent's";
      return `${actor} crew fainted`;
    }
    case "forfeit": {
      const actor = event.side === "A" ? "You" : "Opponent";
      return `${actor} forfeited`;
    }
    case "victory":
      return event.side === "A" ? "Victory!" : "Defeat.";
    case "status_apply":
      return `${event.side === "A" ? "Your" : "Opponent's"} crew gained ${event.status}`;
    case "status_tick":
      return `${event.side === "A" ? "Your" : "Opponent's"} crew took ${event.damage} from ${event.status}`;
    case "swap_required":
      return null;
    default:
      return null;
  }
}

export function buildBattleTurnEmbed(args: {
  captainName: string;
  state: BattleState;
  battleId: string;
  recentEvents: readonly BattleEvent[];
}): APIEmbed {
  const { state } = args;
  const recent = args.recentEvents.map(formatEvent).filter((s): s is string => s !== null);
  const log = recent.length > 0 ? recent.join("\n") : "_no events_";
  const titlePrefix =
    state.winner === "A"
      ? "🏆 Victory"
      : state.winner === "B"
        ? "💀 Defeat"
        : `⚔️ Turn ${state.turn}`;
  const fields = [
    { name: "Your active", value: activeLineForBattle(state.activeA) },
    { name: "Opponent active", value: activeLineForBattle(state.activeB) },
    { name: "This turn", value: log },
  ];
  return {
    title: `${titlePrefix} — ${args.captainName}`,
    description: `Battle \`${args.battleId}\``,
    color: EMBED_COLOR,
    fields,
  };
}

function moveListForCrew(c: CrewSnapshot): string {
  if (c.moves.length === 0) return "_no moves_";
  return c.moves.map((m) => `\`${m.key}\` (${m.name})`).join(", ");
}

function benchListForState(state: BattleState): string {
  if (state.benchA.length === 0) return "_no benched crews_";
  return state.benchA
    .map((c, i) => {
      const status = c.hp <= 0 ? " (fainted)" : "";
      return `${i}: \`${c.templateKey}\` — ${crewDisplayName(c.templateKey)}${status}`;
    })
    .join("\n");
}

export function buildAvailableActionsHint(state: BattleState): string {
  const moves = moveListForCrew(state.activeA);
  const bench = benchListForState(state);
  return [
    `Available moves: ${moves}`,
    `Bench: ${bench}`,
    "Use `/move <name>`, `/switch <crew>`, or `/forfeit`.",
  ].join("\n");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function attributedSide(event: BattleEvent): Side | null {
  switch (event.kind) {
    case "switch":
    case "move":
    case "miss":
    case "stun_skip":
    case "forfeit":
      return event.side;
    case "status_apply":
      return event.side === "A" ? "B" : "A";
    default:
      return null;
  }
}

export function splitLogIntoTurns(log: readonly BattleEvent[]): BattleEvent[][] {
  const turns: BattleEvent[][] = [];
  let current: BattleEvent[] = [];
  let actorsThisTurn = new Set<Side>();
  const finish = () => {
    turns.push(current);
    current = [];
    actorsThisTurn = new Set<Side>();
  };
  for (let i = 0; i < log.length; i++) {
    const event = log[i]!;
    const actor = attributedSide(event);
    if (actor !== null && actorsThisTurn.has(actor) && current.length > 0) {
      finish();
    }
    current.push(event);
    if (actor !== null) actorsThisTurn.add(actor);
    if (event.kind === "victory") {
      finish();
      continue;
    }
    if (event.kind === "swap_required") {
      const next = log[i + 1];
      if (!next || next.kind !== "swap_required") finish();
    }
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

function renderActiveCrewLine(crew: CrewSnapshot): string {
  const emoji = affinityEmoji(crew.affinity);
  return `${emoji} ${crewDisplayName(crew.templateKey)} (Lv ${crew.level})\n${hpBar(crew.hp, crew.maxHp)} ${crew.hp}/${crew.maxHp}`;
}

function renderTurnLines(events: readonly BattleEvent[]): string[] {
  return events.map(formatEvent).filter((s): s is string => s !== null);
}

function renderMoveLog(state: BattleState): string {
  const turns = splitLogIntoTurns(state.log);
  if (turns.length === 0) return "_no events yet_";
  const recent = turns.slice(-3);
  const firstTurnNumber = Math.max(1, state.turn - recent.length + 1);
  const sections: string[] = [];
  for (let i = 0; i < recent.length; i++) {
    const lines = renderTurnLines(recent[i]!);
    if (lines.length === 0) continue;
    const turnNum = firstTurnNumber + i;
    sections.push(`**Turn ${turnNum}**\n${lines.join("\n")}`);
  }
  if (sections.length === 0) return "_no events yet_";
  return sections.join("\n\n");
}

function renderBattleTitle(state: BattleState): string {
  if (state.winner === "A") return "🏆 Victory!";
  if (state.winner === "B") return "💀 Defeat.";
  return `⚔️ Turn ${state.turn}`;
}

export function renderBattleEmbed(state: BattleState): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(renderBattleTitle(state))
    .addFields(
      { name: "Your active", value: renderActiveCrewLine(state.activeA) },
      { name: "Opponent active", value: renderActiveCrewLine(state.activeB) },
      { name: "Move log", value: renderMoveLog(state) },
    );
}

function shortUserId(userId: string): string {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 10)}…`;
}

const LEADERBOARD_TOP_N = 10;

export function buildLeaderboardEmbed(response: LeaderboardResponse): APIEmbed {
  const top = response.entries.slice(0, LEADERBOARD_TOP_N);
  const title = `🏆 Leaderboard — ${response.season.name}`;
  if (top.length === 0) {
    return {
      title,
      description: "No captains ranked yet — be the first to win a match.",
      color: EMBED_COLOR,
    };
  }
  const lines = top.map(
    (entry) =>
      `**${entry.rank}.** \`${shortUserId(entry.userId)}\` — ${entry.elo} ELO (${entry.wins}W / ${entry.losses}L)`,
  );
  return {
    title,
    description: lines.join("\n"),
    color: EMBED_COLOR,
    footer: { text: `Top ${top.length} of ${response.total}` },
  };
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
