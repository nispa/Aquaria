import { describe, expect, it } from "vitest";
import { formatHour } from "./time";

describe("formatHour", () => {
  it("writes an hour of the day as hh:mm", () => {
    expect(formatHour(14.5)).toBe("14:30");
  });

  it("pads single digits", () => {
    expect(formatHour(6.1)).toBe("06:06");
  });

  it("wraps 24 to midnight", () => {
    expect(formatHour(24)).toBe("00:00");
  });
});
