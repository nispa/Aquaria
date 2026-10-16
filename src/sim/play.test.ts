import { describe, expect, it } from "vitest";
import { createSwimState } from "./behaviors";
import {
  applyPlay,
  createPlay,
  DIZZY_SECONDS,
  isEnchanted,
  nextRoll,
  TICKLED_SECONDS,
  updatePlay,
  wriggleBend,
  type PlayInput,
  type PlayState,
} from "./play";

const STEP = 1 / 60;
const circling: PlayInput = { spin: 1, scribbling: false };
const scribbling: PlayInput = { spin: 0, scribbling: true };
const nothing: PlayInput = { spin: 0, scribbling: false };

function play(state: PlayState, input: PlayInput, seconds: number): void {
  for (let time = 0; time < seconds; time += STEP) updatePlay(state, input, STEP);
}

describe("hypnosis", () => {
  it("deepens while circles are drawn near the fish", () => {
    const state = createPlay();

    play(state, circling, 2);

    expect(state.hypnosis).toBe(1);
    expect(state.spin).toBe(1);
  });

  it("wears off once the circles stop, leaving the fish dizzy", () => {
    const state = createPlay();
    play(state, circling, 2);

    play(state, nothing, 1);

    expect(state.hypnosis).toBe(0);
    expect(state.dizzy).toBeGreaterThan(0);
  });

  it("leaves no dizziness after a mere glance", () => {
    const state = createPlay();
    play(state, circling, 0.3);

    play(state, nothing, 1);

    expect(state.dizzy).toBe(0);
  });

  it("lets dizziness pass after a few seconds", () => {
    const state = createPlay();
    play(state, circling, 2);

    play(state, nothing, DIZZY_SECONDS + 1);

    expect([state.dizzy, isEnchanted(state)]).toEqual([0, false]);
  });

  it("makes a hypnotized fish stop, float and turn the way of the circles", () => {
    const state = createPlay();
    play(state, circling, 2);
    const wishes = createSwimState();

    applyPlay(state, wishes, 0, 1.2, 0.2);

    expect(wishes.speed).toBeLessThan(0.2);
    expect(wishes.height).toBe(1.2);
    expect(wishes.yaw).toBeGreaterThan(0);
  });

  it("rolls a hypnotized fish over and over", () => {
    const state = createPlay();
    play(state, circling, 2);
    let roll = 0;

    for (let time = 0; time < 1; time += STEP) roll = nextRoll(state, roll, STEP);

    expect(Math.abs(roll)).toBeGreaterThan(1);
  });

  it("makes a dizzy fish wobble about its heading", () => {
    const state = createPlay();
    play(state, circling, 2);
    play(state, nothing, 0.8);
    const yaws: number[] = [];

    for (let time = 0; time < 2; time += STEP) {
      updatePlay(state, nothing, STEP);
      const wishes = createSwimState();
      applyPlay(state, wishes, 0, 1, 0.2);
      yaws.push(wishes.yaw);
    }

    expect(Math.min(...yaws)).toBeLessThan(-0.3);
    expect(Math.max(...yaws)).toBeGreaterThan(0.3);
  });
});

describe("tickling", () => {
  it("needs a moment of scribbling on the fish", () => {
    const state = createPlay();

    play(state, scribbling, 0.1);

    expect(state.tickled).toBe(0);
  });

  it("sets the fish off when it goes on", () => {
    const state = createPlay();

    play(state, scribbling, 0.6);

    expect(state.tickled).toBeGreaterThan(0);
    expect(isEnchanted(state)).toBe(true);
  });

  it("makes the fish wriggle, then turns it belly up", () => {
    const state = createPlay();
    play(state, scribbling, 0.6);
    let roll = 0;
    const bends: number[] = [];

    for (let time = 0; time < 0.8; time += STEP) {
      updatePlay(state, nothing, STEP);
      roll = nextRoll(state, roll, STEP);
      bends.push(wriggleBend(state) ?? 0);
    }

    expect(Math.min(...bends)).toBeLessThan(-1);
    expect(Math.max(...bends)).toBeGreaterThan(1);
    expect(Math.abs(roll)).toBeGreaterThan(2.5);
  });

  it("then darts off fast in a zigzag", () => {
    const state = createPlay();
    play(state, scribbling, 0.6);
    play(state, nothing, 1.5);
    const wishes = createSwimState();

    applyPlay(state, wishes, 0, 1, 0.2);

    expect(wishes.speed).toBeGreaterThan(1.5);
  });

  it("is over after a few seconds, upright again", () => {
    const state = createPlay();
    play(state, scribbling, 0.6);
    let roll = 0;

    for (let time = 0; time < TICKLED_SECONDS + 1; time += STEP) {
      updatePlay(state, nothing, STEP);
      roll = nextRoll(state, roll, STEP);
    }

    expect(isEnchanted(state)).toBe(false);
    expect(Math.abs(roll)).toBeLessThan(0.05);
    expect(wriggleBend(state)).toBeUndefined();
  });
});

describe("an ordinary fish", () => {
  it("is left alone", () => {
    const state = createPlay();
    const wishes = createSwimState();

    play(state, nothing, 1);
    applyPlay(state, wishes, 0, 1, 0.2);

    expect(isEnchanted(state)).toBe(false);
    expect(wishes).toEqual(createSwimState());
    expect(nextRoll(state, 0, STEP)).toBe(0);
  });
});
