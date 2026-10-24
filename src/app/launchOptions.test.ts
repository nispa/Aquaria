import { describe, expect, it } from "vitest";
import { launchQuery, parseLaunchOptions } from "./launchOptions";

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

describe("size option", () => {
  it("reads the size of the tank to show the scene in", () => {
    expect(parseLaunchOptions("?size=nano").size).toBe("nano");
  });

  it("ignores a size that does not exist", () => {
    expect(parseLaunchOptions("?size=gigantic").size).toBeUndefined();
  });

  it("writes the size back into the query", () => {
    expect(launchQuery({ scene: "iwagumi", size: "small" })).toBe("?scene=iwagumi&size=small");
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

describe("debug option", () => {
  it("reads the debug tools to switch on", () => {
    expect(parseLaunchOptions("?debug=overlay,shapes").debug).toEqual(["overlay", "shapes"]);
  });

  it("drops unknown debug tools", () => {
    expect(parseLaunchOptions("?debug=overlay,wireframe").debug).toEqual(["overlay"]);
  });

  it("switches no debug tool on by default", () => {
    expect(parseLaunchOptions("?scene=reef").debug).toBeUndefined();
  });
});

describe("launchQuery", () => {
  it("writes the options as a query the aquarium reads back", () => {
    const options = {
      scene: "reef",
      seed: 3,
      hour: 21,
      frozenSeconds: 8,
      effects: ["bloom"],
      debug: ["overlay", "shapes"] as const,
    };

    expect(parseLaunchOptions(launchQuery(options))).toEqual(options);
  });

  it("writes nothing for no options", () => {
    expect(launchQuery({})).toBe("");
  });
});
