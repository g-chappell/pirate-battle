import { describe, expect, it } from "vitest";

import { buildCommandsPayload, commandDefinitions } from "./commands.js";

describe("buildCommandsPayload", () => {
  it("returns a non-empty list of slash command JSON payloads", () => {
    const payload = buildCommandsPayload();
    expect(payload.length).toBe(commandDefinitions.length);
    expect(payload.length).toBeGreaterThan(0);
    for (const command of payload) {
      expect(typeof command.name).toBe("string");
      expect(command.name.length).toBeGreaterThan(0);
      if ("description" in command) {
        expect(typeof command.description).toBe("string");
        expect(command.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("includes a /ping command for liveness checks", () => {
    const names = buildCommandsPayload().map((c) => c.name);
    expect(names).toContain("ping");
  });

  it("includes /link and /link-claim commands for the wallet→Discord link flow", () => {
    const names = buildCommandsPayload().map((c) => c.name);
    expect(names).toContain("link");
    expect(names).toContain("link-claim");
  });

  it("/link-claim has a required string option named token", () => {
    const claim = buildCommandsPayload().find((c) => c.name === "link-claim");
    expect(claim).toBeDefined();
    const options = (claim as { options?: Array<Record<string, unknown>> }).options ?? [];
    expect(options.length).toBe(1);
    const tokenOpt = options[0];
    expect(tokenOpt?.name).toBe("token");
    expect(tokenOpt?.required).toBe(true);
  });
});
