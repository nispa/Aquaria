import { describe, expect, it } from "vitest";
import { ACTIVITY_IDS } from "./activities";
import { catalogFixture } from "./fixtures";
import { parseCatalog } from "./parse";

function catalogWithActivities(activities: unknown) {
  const input = catalogFixture();
  return {
    species: input.species.map((species, index) =>
      index === 0 ? { ...species, activities } : species,
    ),
  };
}

describe("activities", () => {
  it("lets species without activities only wander", () => {
    const { activities } = parseCatalog(catalogFixture()).species[0] ?? {};

    expect(activities?.wander.weight).toBeGreaterThan(0);
    expect(activities?.inspect.weight).toBe(0);
    expect(activities?.peck.weight).toBe(0);
  });

  it("reads the places that interest a species and how much", () => {
    const catalog = parseCatalog(
      catalogWithActivities({ peck: { weight: 0.6, tags: { algae: 1, coral: 0.5 } } }),
    );

    expect(catalog.species[0]?.activities.peck).toMatchObject({
      weight: 0.6,
      tags: { algae: 1, coral: 0.5 },
    });
  });

  it("fills durations with defaults", () => {
    const catalog = parseCatalog(catalogWithActivities({ inspect: { weight: 1 } }));

    expect(catalog.species[0]?.activities.inspect.seconds).toEqual([
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("rejects negative weights", () => {
    expect(() => parseCatalog(catalogWithActivities({ wander: { weight: -1 } }))).toThrow(/weight/);
  });

  it("rejects interests outside 0..1", () => {
    expect(() =>
      parseCatalog(catalogWithActivities({ peck: { weight: 1, tags: { algae: 2 } } })),
    ).toThrow(/tags/);
  });

  it("rejects unknown activities", () => {
    expect(() => parseCatalog(catalogWithActivities({ dance: { weight: 1 } }))).toThrow(/dance/);
  });

  it("offers the activities of the roadmap", () => {
    expect(ACTIVITY_IDS).toEqual(["wander", "inspect", "peck", "rest"]);
  });
});

describe("resting", () => {
  it("makes species active by day unless they say otherwise", () => {
    expect(parseCatalog(catalogFixture()).species[0]?.behavior.active).toBe("day");
  });

  it("reads nocturnal and always-active species", () => {
    const input = catalogFixture();
    input.species = input.species.map((species, index) => ({
      ...species,
      behavior: { active: index === 0 ? "night" : "always" },
    }));

    const actives = parseCatalog(input).species.map((species) => species.behavior.active);

    expect(actives).toEqual(["night", "always"]);
  });

  it("lets every species rest in a shelter by default", () => {
    const { rest } = parseCatalog(catalogFixture()).species[0]?.activities ?? {};

    expect(rest?.weight).toBe(1);
    expect(rest?.tags).toEqual({ shelter: 1 });
  });
});

describe("hiding", () => {
  it("lets no individual run for shelter unless the species says so", () => {
    expect(parseCatalog(catalogFixture()).species[0]?.behavior.hiding).toBe(0);
  });
});
