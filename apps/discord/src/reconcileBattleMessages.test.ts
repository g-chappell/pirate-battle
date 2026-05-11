import { describe, expect, it, vi } from "vitest";

import type { ChannelOps, FetchMessageResult } from "./channelOps.js";
import {
  reconcileBattleMessages,
  type ReconcileBattleSnapshot,
} from "./reconcileBattleMessages.js";

function makeChannelOps(
  fetchImpl: (args: { channelId: string; messageId: string }) => Promise<FetchMessageResult>,
): ChannelOps {
  return {
    fetchMessage: fetchImpl,
    sendEmbed: vi.fn(),
    editEmbed: vi.fn(),
    setMessageContent: vi.fn(),
  };
}

const SNAP_BASE: Omit<ReconcileBattleSnapshot, "battleId"> = {
  channelId: "100",
  messageId: "200",
  guildId: "300",
  sentAtMs: 1_700_000_000_000,
  discordUserId: "55512",
};

describe("reconcileBattleMessages", () => {
  it("calls onResynced with the freshly-fetched sentAtMs when the message exists", async () => {
    const channelOps = makeChannelOps(async () => ({ ok: true, sentAtMs: 1_700_000_999_999 }));
    const onResynced = vi.fn().mockResolvedValue(undefined);
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [{ ...SNAP_BASE, battleId: "b1" }],
      onResynced,
      onCleared,
    });
    expect(report).toEqual({ checked: 1, resynced: 1, cleared: 0, failed: 0 });
    expect(onResynced).toHaveBeenCalledWith({
      battleId: "b1",
      channelId: "100",
      messageId: "200",
      guildId: "300",
      sentAtMs: 1_700_000_999_999,
      discordUserId: "55512",
    });
    expect(onCleared).not.toHaveBeenCalled();
  });

  it("calls onCleared when the message is missing (unknown_message reason)", async () => {
    const channelOps = makeChannelOps(async () => ({ ok: false, reason: "Unknown Message" }));
    const onResynced = vi.fn().mockResolvedValue(undefined);
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [{ ...SNAP_BASE, battleId: "b1" }],
      onResynced,
      onCleared,
    });
    expect(report).toEqual({ checked: 1, resynced: 0, cleared: 1, failed: 0 });
    expect(onCleared).toHaveBeenCalledWith({ battleId: "b1", discordUserId: "55512" });
    expect(onResynced).not.toHaveBeenCalled();
  });

  it("treats 'channel_not_text' the same as a missing message and clears tracking", async () => {
    const channelOps = makeChannelOps(async () => ({ ok: false, reason: "channel_not_text" }));
    const onResynced = vi.fn().mockResolvedValue(undefined);
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [{ ...SNAP_BASE, battleId: "b1" }],
      onResynced,
      onCleared,
    });
    expect(report.cleared).toBe(1);
    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it("counts non-missing errors as 'failed' without clearing", async () => {
    const channelOps = makeChannelOps(async () => ({ ok: false, reason: "Service Unavailable" }));
    const onResynced = vi.fn().mockResolvedValue(undefined);
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const logger = { warn: vi.fn() };
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [{ ...SNAP_BASE, battleId: "b1" }],
      onResynced,
      onCleared,
      logger,
    });
    expect(report).toEqual({ checked: 1, resynced: 0, cleared: 0, failed: 1 });
    expect(onCleared).not.toHaveBeenCalled();
    expect(onResynced).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("aggregates a mix of snapshots", async () => {
    const channelOps = makeChannelOps(async (args) => {
      if (args.messageId === "200") return { ok: true, sentAtMs: 9_999_999 };
      if (args.messageId === "201") return { ok: false, reason: "Unknown Message" };
      return { ok: false, reason: "boom" };
    });
    const onResynced = vi.fn().mockResolvedValue(undefined);
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [
        { ...SNAP_BASE, battleId: "b1", messageId: "200" },
        { ...SNAP_BASE, battleId: "b2", messageId: "201" },
        { ...SNAP_BASE, battleId: "b3", messageId: "202" },
      ],
      onResynced,
      onCleared,
    });
    expect(report).toEqual({ checked: 3, resynced: 1, cleared: 1, failed: 1 });
  });

  it("does NOT throw when onResynced or onCleared hooks reject — counts as failed", async () => {
    const channelOps = makeChannelOps(async () => ({ ok: true, sentAtMs: 1 }));
    const onResynced = vi.fn().mockRejectedValue(new Error("server down"));
    const onCleared = vi.fn().mockResolvedValue(undefined);
    const logger = { warn: vi.fn() };
    const report = await reconcileBattleMessages({
      channelOps,
      listSnapshots: async () => [{ ...SNAP_BASE, battleId: "b1" }],
      onResynced,
      onCleared,
      logger,
    });
    expect(report).toEqual({ checked: 1, resynced: 0, cleared: 0, failed: 1 });
    expect(logger.warn).toHaveBeenCalled();
  });
});
