import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createRng } from "../../core/rng";
import { activitiesSchema } from "../../scene/activities";
import { createPlaceFinder, type Place } from "../places";
import { createActivityChooser } from "./choose";
import { createActivityState, createSwimState, type SwimContext } from "./types";

const rock: Place = { x: 1, z: -1, height: 0.3, tags: ["rock", "algae"] };
const everywhere = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));

function contextAmong(places: readonly Place[], seed = 1): SwimContext {
  return {
    position: new Vector3(0, 1, -1),
    room: new Box3(new Vector3(-2, 0, -2), new Vector3(2, 2, 0)),
    length: 0.2,
    rng: createRng(seed),
    places: createPlaceFinder(
      () => places,
      () => 0,
    ),
  };
}

/** The activities chosen in 100 draws. */
function choices(activities: unknown, places: readonly Place[], within = everywhere): string[] {
  const spec = activitiesSchema.parse(activities);
  const chooser = createActivityChooser();
  const context = contextAmong(places);
  const state = createActivityState();
  const wishes = createSwimState();
  return Array.from({ length: 100 }, () => {
    chooser.choose(state, wishes, spec, context, within);
    return state.id;
  });
}

describe("choosing what to do next", () => {
  it("keeps wandering when a species declares nothing else", () => {
    expect(new Set(choices({}, [rock]))).toEqual(new Set(["wander"]));
  });

  it("sometimes goes pecking at an interesting place nearby", () => {
    const picks = choices({ peck: { weight: 1, tags: { algae: 1 } } }, [rock]);

    expect(new Set(picks)).toEqual(new Set(["wander", "peck"]));
  });

  it("never pecks without an interesting place nearby", () => {
    const picks = choices({ peck: { weight: 1, tags: { coral: 1 } } }, [rock]);

    expect(new Set(picks)).toEqual(new Set(["wander"]));
  });

  it("never heads for a place outside where the fish may go", () => {
    const elsewhere = new Box3(new Vector3(-5, -5, -5), new Vector3(0, 5, 5));

    const picks = choices({ peck: { weight: 1, tags: { algae: 1 } } }, [rock], elsewhere);

    expect(new Set(picks)).toEqual(new Set(["wander"]));
  });

  it("chooses in proportion to the weights", () => {
    const picks = choices({ wander: { weight: 1 }, inspect: { weight: 3, tags: { rock: 1 } } }, [
      rock,
    ]);

    expect(picks.filter((pick) => pick === "inspect").length).toBeGreaterThan(60);
  });

  it("aims an activity at the top of its place", () => {
    const spec = activitiesSchema.parse({
      wander: { weight: 0 },
      peck: { weight: 1, tags: { algae: 1 } },
    });
    const state = createActivityState();

    createActivityChooser().choose(
      state,
      createSwimState(),
      spec,
      contextAmong([rock]),
      everywhere,
    );

    expect(state.id).toBe("peck");
    expect(state.target.toArray()).toEqual([1, 0.3, -1]);
    expect(state.targetSize).toBe(0.3);
  });

  it("goes back to wandering with its mouth shut when called off", () => {
    const spec = activitiesSchema.parse({});
    const state = createActivityState();
    state.id = "peck";
    const wishes = createSwimState();
    wishes.mouth = 1;
    wishes.steep = true;

    createActivityChooser().wander(state, wishes, spec, contextAmong([]));

    expect(state.id).toBe("wander");
    expect(state.timer).toBeGreaterThan(0);
    expect([wishes.mouth, wishes.steep]).toEqual([0, false]);
  });
});
