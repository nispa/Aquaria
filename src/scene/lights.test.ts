import { describe, expect, it } from "vitest";
import { lightsSchema, RECOMMENDED_LIGHTS } from "./lights";

describe("lights", () => {
  it("defaults to the recommended reef lighting", () => {
    expect(lightsSchema.parse({})).toEqual(RECOMMENDED_LIGHTS);
  });

  it("fills a partial custom setup from the recommended one", () => {
    const lights = lightsSchema.parse({ channels: { accent: { color: "#ff6ad5", level: 0.4 } } });

    expect(lights.channels.accent).toEqual({ color: "#ff6ad5", level: 0.4 });
    expect(lights.channels.white).toEqual(RECOMMENDED_LIGHTS.channels.white);
  });

  it("recommends a white, actinic blue and violet reef setup with the accent off", () => {
    const { channels } = RECOMMENDED_LIGHTS;

    const on = [channels.white.level, channels.blue.level, channels.violet.level];

    expect(on.every((value) => value > 0)).toBe(true);
    expect(channels.accent.level).toBe(0);
  });

  it("starts at a fixed midday hour, so the aquarium looks the same until changed", () => {
    expect(RECOMMENDED_LIGHTS.cycle).toMatchObject({ mode: "fixed", hour: 13 });
  });

  it("rejects hours outside the day", () => {
    expect(lightsSchema.safeParse({ cycle: { sunrise: 25 } }).success).toBe(false);
  });

  it("rejects a ramp longer than half the day", () => {
    expect(lightsSchema.safeParse({ cycle: { ramp: 13 } }).success).toBe(false);
  });
});

describe("light fixture", () => {
  it("is the open sky (a single sun) unless a setup asks for LED spots", () => {
    expect(RECOMMENDED_LIGHTS.fixture).toEqual({ type: "sun", spots: 6 });
  });

  it("accepts a row of LED spots", () => {
    expect(lightsSchema.parse({ fixture: { type: "spots", spots: 8 } }).fixture).toEqual({
      type: "spots",
      spots: 8,
    });
  });

  it("rejects an empty or crowded row of spots", () => {
    expect(lightsSchema.safeParse({ fixture: { type: "spots", spots: 0 } }).success).toBe(false);
    expect(lightsSchema.safeParse({ fixture: { type: "spots", spots: 40 } }).success).toBe(false);
  });
});
