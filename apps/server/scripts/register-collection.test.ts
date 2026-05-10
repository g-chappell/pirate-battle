import { describe, expect, it } from "vitest";

import { RegisterCollectionError } from "../src/cardano/registerCollection.js";

import { parseArgv } from "./register-collection.js";

describe("parseArgv", () => {
  it("parses --flag value form", () => {
    const parsed = parseArgv([
      "--policy",
      "abc",
      "--name",
      "Order of the Kraken",
      "--rules",
      "rules.json",
    ]);
    expect(parsed.policy).toBe("abc");
    expect(parsed.name).toBe("Order of the Kraken");
    expect(parsed.rules).toBe("rules.json");
    expect(parsed.dryRun).toBe(false);
  });

  it("parses --flag=value form", () => {
    const parsed = parseArgv(["--policy=abc", "--name=OTK", "--rules=./rules.json"]);
    expect(parsed.policy).toBe("abc");
    expect(parsed.name).toBe("OTK");
    expect(parsed.rules).toBe("./rules.json");
  });

  it("recognises --dry-run", () => {
    const parsed = parseArgv(["--policy", "abc", "--name", "n", "--rules", "r.json", "--dry-run"]);
    expect(parsed.dryRun).toBe(true);
  });

  it("throws when a required arg is missing", () => {
    expect(() => parseArgv(["--policy", "abc", "--name", "n"])).toThrow(RegisterCollectionError);
  });

  it("throws on unknown argument", () => {
    expect(() =>
      parseArgv(["--policy", "abc", "--name", "n", "--rules", "r.json", "--evil"]),
    ).toThrow(/unknown argument/);
  });

  it("throws when a flag is followed by another flag instead of a value", () => {
    expect(() => parseArgv(["--policy", "--name", "n", "--rules", "r.json"])).toThrow(
      /--policy requires a value/,
    );
  });
});
