import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paramControls, paramLabel } from "./paramControls";

const schema = z.object({
  strength: z.number().min(0).max(2).default(0.5),
  samples: z.number().int().min(16).max(96).default(48),
  absorption: z.tuple([z.number().min(0).max(2), z.number().min(0).max(2)]).default([0.4, 0.1]),
  tint: z.string().default("#ffffff"),
  threshold: z.number().min(0).default(0.8),
  focus: z.number().default(-2),
});

describe("parameter controls", () => {
  it("offers a slider within a number's bounds, at its default", () => {
    expect(paramControls(schema, {})[0]).toEqual({
      key: "strength",
      kind: "number",
      min: 0,
      max: 2,
      step: 0.01,
      value: 0.5,
    });
  });

  it("steps whole numbers by one", () => {
    expect(paramControls(schema, {})[1]).toMatchObject({ kind: "number", step: 1 });
  });

  it("offers one slider per item of a tuple", () => {
    expect(paramControls(schema, {})[2]).toMatchObject({ kind: "numbers", value: [0.4, 0.1] });
  });

  it("offers a color picker for a color", () => {
    expect(paramControls(schema, {})[3]).toEqual({ key: "tint", kind: "color", value: "#ffffff" });
  });

  it("gives a number without an upper bound a range around its default", () => {
    expect(paramControls(schema, {})[4]).toMatchObject({ min: 0, max: 3.2 });
  });

  it("gives a number without bounds a range around its default", () => {
    expect(paramControls(schema, {})[5]).toMatchObject({ min: -8, max: 8 });
  });

  it("shows the values given instead of the defaults", () => {
    expect(paramControls(schema, { strength: 1.5 })[0]?.value).toBe(1.5);
  });

  it("offers nothing for a schema that is not an object", () => {
    expect(paramControls(z.number(), {})).toEqual([]);
  });

  it("turns a camel-case key into words", () => {
    expect(paramLabel("sunFocus")).toBe("Sun focus");
  });
});
