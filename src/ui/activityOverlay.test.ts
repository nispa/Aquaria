import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { catalogFixture } from "../scene/fixtures";
import { parseCatalog } from "../scene/parse";
import { createActivityState, createSwimState } from "../sim/behaviors";
import { createPlay } from "../sim/play";
import type { Fish } from "../sim/simulation";
import {
  activityColor,
  activityLabel,
  fishDetails,
  fishLabel,
  gestureLabel,
} from "./activityOverlay";

const species = parseCatalog(catalogFixture()).species[0];

/** A blue tang of 25 cm cruising at cruise speed, 40% full. */
function fishFixture(): Fish {
  if (species === undefined) throw new Error("The catalog fixture has no species.");
  return {
    id: 1,
    species,
    position: new Vector3(),
    velocity: new Vector3(species.speed.cruise, 0, 0),
    length: 0.25,
    swimPhase: 0,
    opacity: 1,
    gaze: 0,
    bend: 0,
    effort: 1,
    satiety: 0.4,
    mouth: 0,
    fear: 0,
    state: "swimming",
    swim: createSwimState(),
    activity: createActivityState(),
    play: createPlay(),
    roll: 0,
    hiding: 0,
    refuge: new Vector3(),
    side: 1,
  };
}

describe("activityLabel", () => {
  it("shows how long a fish keeps wandering", () => {
    const activity = createActivityState();
    activity.timer = 12.4;

    expect(activityLabel(activity)).toBe("wander 12s");
  });

  it("shows how many pecks are left", () => {
    const activity = createActivityState();
    activity.id = "peck";
    activity.count = 3;

    expect(activityLabel(activity)).toBe("peck ×3");
  });

  it("shows how long a fish keeps resting", () => {
    const activity = createActivityState();
    activity.id = "rest";
    activity.timer = 41.6;

    expect(activityLabel(activity)).toBe("rest 42s");
  });

  it("names other activities plainly", () => {
    const activity = createActivityState();
    activity.id = "inspect";

    expect(activityLabel(activity)).toBe("inspect");
  });
});

describe("activityColor", () => {
  it("gives every activity its own color", () => {
    const colors = (["wander", "inspect", "peck", "rest"] as const).map(activityColor);

    expect(new Set(colors).size).toBe(4);
  });
});

describe("fishLabel", () => {
  it("shows the activity of an ordinary fish", () => {
    expect(fishLabel(fishFixture())).toBe("wander 0s");
  });

  it("shows a spell rather than the activity", () => {
    const fish = fishFixture();
    fish.play.hypnosis = 0.8;

    expect(fishLabel(fish)).toBe("hypnotized 80%");
  });

  it("shows how long dizziness lasts", () => {
    const fish = fishFixture();
    fish.play.dizzy = 2.6;

    expect(fishLabel(fish)).toBe("dizzy 3s");
  });

  it("shows a fish hiding after a fright, and for how long", () => {
    const fish = fishFixture();
    fish.hiding = 3.2;

    expect(fishLabel(fish)).toBe("hiding 3s");
  });

  it("shows a tickled fish above all", () => {
    const fish = fishFixture();
    fish.play.hypnosis = 0.5;
    fish.play.tickled = 1;

    expect(fishLabel(fish)).toBe("tickled!");
  });
});

describe("fishDetails", () => {
  it("lists the species, style, speed, satiety and fear", () => {
    const fish = fishFixture();

    expect(fishDetails(fish)).toEqual([
      "Blue tang · 25 cm",
      "cruise · wander 0s",
      "speed 1.0× cruise",
      "full 40% · fear 0%",
    ]);
  });

  it("adds the spell, when there is one", () => {
    const fish = fishFixture();
    fish.play.dizzy = 1;

    expect(fishDetails(fish).at(-1)).toBe("dizzy 1s");
  });
});

describe("gestureLabel", () => {
  it("names circles and their way", () => {
    expect(gestureLabel(1, false)).toBe("finger: circles ↺");
    expect(gestureLabel(-1, false)).toBe("finger: circles ↻");
  });

  it("names scribbles", () => {
    expect(gestureLabel(0, true)).toBe("finger: scribbling");
  });

  it("says when the finger draws nothing", () => {
    expect(gestureLabel(0, false)).toBe("finger: —");
  });
});
