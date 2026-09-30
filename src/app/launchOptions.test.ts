import { describe, expect, it } from "vitest";
import { parseLaunchOptions } from "./launchOptions";

describe("parseLaunchOptions", () => {
  it("names no scene and runs live by default, so the saved or default scene opens", () => {
    expect(parseLaunchOptions("")).toEqual({});
  });

  it("reads the scene id", () => {
    expect(parseLaunchOptions("?scene=kelp-forest").scene).toBe("kelp-forest");
  });

  it("rejects scene ids that could escape the scenes folder", () => {
    expect(parseLaunchOptions("?scene=../secret").scene).toBeUndefined();
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

describe("effects option", () => {
  it("reads a comma-separated list of features to enable", () => {
    expect(parseLaunchOptions("?effects=shadows,bloom").effects).toEqual(["shadows", "bloom"]);
  });

  it("reads 'none' as a request to turn every feature off", () => {
    expect(parseLaunchOptions("?effects=none").effects).toEqual([]);
  });

  it("drops ids with unexpected characters", () => {
    expect(parseLaunchOptions("?effects=bloom,<script>").effects).toEqual(["bloom"]);
  });

  it("leaves the choice to saved settings when the option is absent", () => {
    expect(parseLaunchOptions("?seed=3").effects).toBeUndefined();
  });
});

describe("hour option", () => {
  it("reads a fixed hour of the aquarium day", () => {
    expect(parseLaunchOptions("?hour=21.5").hour).toBe(21.5);
  });

  it("ignores hours outside the day", () => {
    expect(parseLaunchOptions("?hour=25").hour).toBeUndefined();
  });
});
