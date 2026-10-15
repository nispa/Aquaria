import { describe, expect, it } from "vitest";
import { cardOrder, lengthLabel } from "./fishCards";

const species = [{ id: "tang" }, { id: "clownfish" }, { id: "tetra" }, { id: "guppy" }];

describe("cardOrder", () => {
  it("lists the species in the tank first, then the others, each in catalog order", () => {
    const counts = { tetra: 12, tang: 3, guppy: 0 };

    const ids = cardOrder(species, counts).map((entry) => entry.id);

    expect(ids).toEqual(["tang", "tetra", "clownfish", "guppy"]);
  });
});

describe("lengthLabel", () => {
  it("shows a body length in whole centimeters", () => {
    expect(lengthLabel(0.254)).toBe("25 cm");
  });

  it("keeps one decimal for small fish", () => {
    expect(lengthLabel(0.035)).toBe("3.5 cm");
  });

  it("drops a zero decimal", () => {
    expect(lengthLabel(0.04)).toBe("4 cm");
  });
});
