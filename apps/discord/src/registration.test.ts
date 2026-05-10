import { describe, expect, it } from "vitest";

import { pickRegistrationRoute } from "./registration.js";

describe("pickRegistrationRoute", () => {
  it("returns the guild-scoped route when devGuildId is provided", () => {
    const route = pickRegistrationRoute({
      clientId: "12345",
      devGuildId: "67890",
    });
    expect(route).toBe("/applications/12345/guilds/67890/commands");
  });

  it("returns the global route when devGuildId is omitted", () => {
    const route = pickRegistrationRoute({ clientId: "12345" });
    expect(route).toBe("/applications/12345/commands");
  });

  it("returns the global route when devGuildId is an empty string", () => {
    const route = pickRegistrationRoute({ clientId: "12345", devGuildId: "" });
    expect(route).toBe("/applications/12345/commands");
  });
});
