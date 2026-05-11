export const MESSAGE_ROTATION_THRESHOLD_MS = 14 * 60 * 1000;

export type BattleMessageTransition = "create" | "edit" | "rotate";

export interface DecideTransitionInput {
  hasMessage: boolean;
  sentAtMs: number | null;
  nowMs: number;
  thresholdMs?: number;
}

export function decideTransition(input: DecideTransitionInput): BattleMessageTransition {
  if (!input.hasMessage || input.sentAtMs === null) {
    return "create";
  }
  const threshold = input.thresholdMs ?? MESSAGE_ROTATION_THRESHOLD_MS;
  if (input.nowMs - input.sentAtMs >= threshold) {
    return "rotate";
  }
  return "edit";
}

export interface BuildContinuationLinkInput {
  guildId: string | null;
  channelId: string;
  messageId: string;
}

export function buildContinuationLink(input: BuildContinuationLinkInput): string {
  const guildSegment = input.guildId ?? "@me";
  return `https://discord.com/channels/${guildSegment}/${input.channelId}/${input.messageId}`;
}

export function buildContinuationContent(link: string): string {
  return `**Battle view continued at** ${link}`;
}
