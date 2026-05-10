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
});
