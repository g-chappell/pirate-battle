import { describe, expect, it } from "vitest";

import {
  MESSAGE_ROTATION_THRESHOLD_MS,
  buildContinuationContent,
  buildContinuationLink,
  decideTransition,
} from "./battleMessageState.js";

describe("decideTransition", () => {
  it("returns 'create' when there is no existing message", () => {
    expect(decideTransition({ hasMessage: false, sentAtMs: null, nowMs: 0 })).toBe("create");
  });

  it("returns 'create' when hasMessage is true but sentAtMs is missing (bad state)", () => {
    expect(decideTransition({ hasMessage: true, sentAtMs: null, nowMs: 0 })).toBe("create");
  });

  it("returns 'edit' when the message is fresh", () => {
    expect(decideTransition({ hasMessage: true, sentAtMs: 1000, nowMs: 1000 + 60_000 })).toBe(
      "edit",
    );
  });

  it("returns 'rotate' exactly at the threshold (>=)", () => {
    expect(
      decideTransition({
        hasMessage: true,
        sentAtMs: 0,
        nowMs: MESSAGE_ROTATION_THRESHOLD_MS,
      }),
    ).toBe("rotate");
  });

  it("returns 'rotate' past the threshold", () => {
    expect(
      decideTransition({
        hasMessage: true,
        sentAtMs: 0,
        nowMs: MESSAGE_ROTATION_THRESHOLD_MS + 1,
      }),
    ).toBe("rotate");
  });

  it("respects a custom thresholdMs", () => {
    expect(
      decideTransition({
        hasMessage: true,
        sentAtMs: 0,
        nowMs: 5_000,
        thresholdMs: 5_000,
      }),
    ).toBe("rotate");
    expect(
      decideTransition({
        hasMessage: true,
        sentAtMs: 0,
        nowMs: 4_999,
        thresholdMs: 5_000,
      }),
    ).toBe("edit");
  });
});

describe("buildContinuationLink", () => {
  it("builds a guild-scoped message link", () => {
    expect(buildContinuationLink({ guildId: "100", channelId: "200", messageId: "300" })).toBe(
      "https://discord.com/channels/100/200/300",
    );
  });

  it("uses '@me' for DMs (null guildId)", () => {
    expect(buildContinuationLink({ guildId: null, channelId: "200", messageId: "300" })).toBe(
      "https://discord.com/channels/@me/200/300",
    );
  });
});

describe("buildContinuationContent", () => {
  it("renders the continuation link prefix", () => {
    const link = "https://discord.com/channels/100/200/300";
    expect(buildContinuationContent(link)).toBe(`**Battle view continued at** ${link}`);
  });
});
