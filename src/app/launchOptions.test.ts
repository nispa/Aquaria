import { describe, expect, it } from "vitest";
import { parseLaunchOptions } from "./launchOptions";

describe("parseLaunchOptions", () => {
  it("defaults to the reef scene, live mode", () => {
    expect(parseLaunchOptions("")).toEqual({ scene: "reef" });
  });

  it("reads the scene id", () => {
    expect(parseLaunchOptions("?scene=kelp-forest").scene).toBe("kelp-forest");
  });

  it("rejects scene ids that could escape the scenes folder", () => {
    expect(parseLaunchOptions("?scene=../secret").scene).toBe("reef");
  });

  it("reads a frozen time for deterministic screenshots", () => {
    expect(parseLaunchOptions("?frozen=12.5").frozenSeconds).toBe(12.5);
  });

  it("ignores invalid frozen times", () => {
    expect(parseLaunchOptions("?frozen=abc").frozenSeconds).toBeUndefined();
    expect(parseLaunchOptions("?frozen=-3").frozenSeconds).toBeUndefined();
  });

  it("reads a seed override", () => {
    expect(parseLaunchOptions("?seed=7").seed).toBe(7);
  });
});
