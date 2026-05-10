import { describe, expect, it } from "vitest";

import { readBotEnv } from "./bot.js";

describe("readBotEnv", () => {
  it("returns the token when DISCORD_TOKEN is set", () => {
    expect(readBotEnv({ DISCORD_TOKEN: "abc-123" })).toEqual({ token: "abc-123" });
  });

  it("throws when DISCORD_TOKEN is missing", () => {
    expect(() => readBotEnv({})).toThrowError(/DISCORD_TOKEN/);
  });

  it("throws when DISCORD_TOKEN is empty", () => {
    expect(() => readBotEnv({ DISCORD_TOKEN: "" })).toThrowError(/DISCORD_TOKEN/);
  });
});
