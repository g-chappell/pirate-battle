import { describe, expect, it } from "vitest";

import { isReadyToSubmit, TEAM_SIZE, toggleSelection } from "./teamBuilder";

describe("toggleSelection", () => {
  it("adds a key when not present", () => {
    expect(toggleSelection([], "a")).toEqual(["a"]);
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes a key when already present", () => {
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("ignores adds beyond TEAM_SIZE", () => {
    const full = ["c1", "c2", "c3", "c4", "c5", "c6"];
    expect(toggleSelection(full, "c7")).toEqual(full);
  });

  it("still allows removal when at TEAM_SIZE", () => {
    const full = ["c1", "c2", "c3", "c4", "c5", "c6"];
    expect(toggleSelection(full, "c3")).toEqual(["c1", "c2", "c4", "c5", "c6"]);
  });
});

describe("isReadyToSubmit", () => {
  it("returns true only at exactly TEAM_SIZE", () => {
    expect(isReadyToSubmit([])).toBe(false);
    expect(isReadyToSubmit(new Array(TEAM_SIZE - 1).fill("k"))).toBe(false);
    expect(isReadyToSubmit(new Array(TEAM_SIZE).fill("k"))).toBe(true);
  });
});
