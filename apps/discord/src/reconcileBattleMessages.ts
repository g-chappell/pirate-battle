import type { ChannelOps } from "./channelOps.js";

export interface ReconcileBattleSnapshot {
  battleId: string;
  channelId: string;
  messageId: string;
  guildId: string | null;
  sentAtMs: number;
  discordUserId: string;
}

export interface ReconcileResyncedHook {
  (args: {
    battleId: string;
    channelId: string;
    messageId: string;
    guildId: string | null;
    sentAtMs: number;
    discordUserId: string;
  }): Promise<void>;
}

export interface ReconcileClearedHook {
  (args: { battleId: string; discordUserId: string }): Promise<void>;
}

export interface ReconcileDeps {
  channelOps: ChannelOps;
  listSnapshots(): Promise<ReconcileBattleSnapshot[]>;
  onResynced: ReconcileResyncedHook;
  onCleared: ReconcileClearedHook;
  logger?: { warn: (...args: unknown[]) => void };
}

export interface ReconcileReport {
  checked: number;
  resynced: number;
  cleared: number;
  failed: number;
}

export async function reconcileBattleMessages(deps: ReconcileDeps): Promise<ReconcileReport> {
  const logger = deps.logger ?? console;
  const snapshots = await deps.listSnapshots();
  const report: ReconcileReport = { checked: 0, resynced: 0, cleared: 0, failed: 0 };

  for (const snap of snapshots) {
    report.checked += 1;
    const result = await deps.channelOps.fetchMessage({
      channelId: snap.channelId,
      messageId: snap.messageId,
    });
    if (result.ok) {
      try {
        await deps.onResynced({
          battleId: snap.battleId,
          channelId: snap.channelId,
          messageId: snap.messageId,
          guildId: snap.guildId,
          sentAtMs: result.sentAtMs,
          discordUserId: snap.discordUserId,
        });
        report.resynced += 1;
      } catch (err) {
        report.failed += 1;
        logger.warn?.("[reconcile] onResynced hook failed", snap.battleId, err);
      }
      continue;
    }
    if (isMessageMissing(result.reason)) {
      try {
        await deps.onCleared({ battleId: snap.battleId, discordUserId: snap.discordUserId });
        report.cleared += 1;
      } catch (err) {
        report.failed += 1;
        logger.warn?.("[reconcile] onCleared hook failed", snap.battleId, err);
      }
    } else {
      report.failed += 1;
      logger.warn?.(
        "[reconcile] fetchMessage failed (will retry on next start)",
        snap.battleId,
        result.reason,
      );
    }
  }
  return report;
}

function isMessageMissing(reason: string): boolean {
  const lowered = reason.toLowerCase();
  return (
    lowered.includes("unknown message") ||
    lowered.includes("not found") ||
    lowered.includes("missing access") ||
    lowered.includes("channel_not_text")
  );
}
