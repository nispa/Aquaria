import { describe, expect, it } from "vitest";
import { lightsSchema, type Lights } from "../scene/lights";
import { channelLevels, createLightMixer, cycleHour, hexToLinear, lightMix } from "./lightCycle";

const recommended: Lights = lightsSchema.parse({});
const withCycle = (cycle: Partial<Lights["cycle"]>): Lights => ({
  ...recommended,
  cycle: { ...recommended.cycle, ...cycle },
});

describe("cycleHour", () => {
  it("stays at the chosen hour in fixed mode", () => {
    const lights = withCycle({ mode: "fixed", hour: 13 });

    expect(cycleHour(lights.cycle, { clockHour: 22, elapsedSeconds: 5000 })).toBe(13);
  });

  it("follows the wall clock in clock mode", () => {
    const lights = withCycle({ mode: "clock" });

    expect(cycleHour(lights.cycle, { clockHour: 21.5, elapsedSeconds: 0 })).toBe(21.5);
  });

  it("runs a whole day in the chosen minutes in accelerated mode, from the chosen hour", () => {
    const lights = withCycle({ mode: "accelerated", minutes: 10, hour: 6 });

    expect(cycleHour(lights.cycle, { clockHour: 0, elapsedSeconds: 150 })).toBeCloseTo(12);
  });

  it("wraps past midnight", () => {
    const lights = withCycle({ mode: "accelerated", minutes: 10, hour: 18 });

    expect(cycleHour(lights.cycle, { clockHour: 0, elapsedSeconds: 300 })).toBeCloseTo(6);
  });
});

describe("channelLevels", () => {
  const day = withCycle({ sunrise: 9, sunset: 21, ramp: 1 });

  it("runs every channel at its set level at midday", () => {
    const levels = channelLevels(day, 15);

    expect(levels).toEqual({
      white: day.channels.white.level,
      blue: day.channels.blue.level,
      violet: day.channels.violet.level,
      accent: day.channels.accent.level,
    });
  });

  it("keeps only the moonlight on at night, in the blue channel", () => {
    const levels = channelLevels(day, 2);

    expect(levels).toEqual({ white: 0, blue: day.moon, violet: 0, accent: 0 });
  });

  it("switches the blue on before the white at dawn", () => {
    const levels = channelLevels(day, 8.9);

    expect(levels.blue).toBeGreaterThan(day.moon);
    expect(levels.white).toBe(0);
  });

  it("leaves the blue on after the white at dusk", () => {
    const levels = channelLevels(day, 21.1);

    expect(levels.white).toBe(0);
    expect(levels.blue).toBeGreaterThan(day.moon);
  });

  it("brightens gradually during the ramp", () => {
    const early = channelLevels(day, 9.25).white;
    const later = channelLevels(day, 9.75).white;

    expect(0 < early && early < later && later < day.channels.white.level).toBe(true);
  });

  it("handles a day that crosses midnight", () => {
    const night = withCycle({ sunrise: 20, sunset: 4, ramp: 1 });

    expect(channelLevels(night, 0).white).toBe(night.channels.white.level);
    expect(channelLevels(night, 12).white).toBe(0);
  });
});

describe("lightMix", () => {
  it("is brightest and near-white at midday with the recommended channels", () => {
    const mix = lightMix(recommended, channelLevels(recommended, 13));

    expect(mix.brightness).toBeGreaterThan(0.8);
    expect(Math.min(...mix.color)).toBeGreaterThan(0.5);
  });

  it("turns deep blue and dim at night", () => {
    const mix = lightMix(recommended, channelLevels(recommended, 2));
    const [red, green, blue] = mix.color;

    expect(mix.brightness).toBeLessThan(0.15);
    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });

  it("makes corals fluoresce more under blue alone than under full white", () => {
    const actinicOnly = lightMix(recommended, { white: 0, blue: 1, violet: 0.6, accent: 0 });
    const fullDay = lightMix(recommended, { white: 1, blue: 1, violet: 0.6, accent: 0 });

    expect(actinicOnly.fluorescence).toBeGreaterThan(fullDay.fluorescence);
  });

  it("takes the color of a custom accent channel", () => {
    const custom: Lights = {
      ...recommended,
      channels: { ...recommended.channels, accent: { color: "#ff0000", level: 1 } },
    };

    const mix = lightMix(custom, { white: 0, blue: 0, violet: 0, accent: 1 });

    expect(mix.color).toEqual([1, 0, 0]);
  });

  it("is black with every channel off", () => {
    expect(lightMix(recommended, { white: 0, blue: 0, violet: 0, accent: 0 }).brightness).toBe(0);
  });
});

describe("hexToLinear", () => {
  it("decodes sRGB hex colors to linear values", () => {
    const [red, green, blue] = hexToLinear("#ff8000");

    expect([red, blue]).toEqual([1, 0]);
    expect(green).toBeCloseTo(0.2158, 3);
  });
});

describe("light mixer", () => {
  it("gives the same result as mixing by hand, for any hour", () => {
    const mixer = createLightMixer(recommended);

    const hours = [2, 8.9, 13, 21.1];

    const copies = hours.map((hour) => {
      const state = mixer.at(hour);
      return { ...state, color: [...state.color] };
    });

    expect(copies).toEqual(
      hours.map((hour) => lightMix(recommended, channelLevels(recommended, hour))),
    );
  });

  it("reuses one result object, so the render loop does not allocate", () => {
    const mixer = createLightMixer(recommended);

    expect(mixer.at(2)).toBe(mixer.at(13));
  });
});
