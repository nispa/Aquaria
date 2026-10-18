import { describe, expect, it } from "vitest";
import {
  createPectoralFins,
  pectoralStroke,
  stepPectoralFins,
  type FinDrive,
} from "./pectoralFins";

const HOVERING: FinDrive = { speedRatio: 0.3, acceleration: 0, bend: 0, thrust: 0.6 };
const CRUISING: FinDrive = { speedRatio: 1, acceleration: 0, bend: 0, thrust: 1 };
const FIN_PULSE: FinDrive = { speedRatio: 1.2, acceleration: 2.5, bend: 0, thrust: 0 };
const FIN_GLIDE: FinDrive = { speedRatio: 1.1, acceleration: -0.4, bend: 0, thrust: 0 };
const BURSTING: FinDrive = { speedRatio: 2.2, acceleration: 2, bend: 0, thrust: 1 };
const BRAKING: FinDrive = { speedRatio: 0.6, acceleration: -2, bend: 0, thrust: 1 };
const TURNING_LEFT: FinDrive = { speedRatio: 0.5, acceleration: 0, bend: 1.2, thrust: 0.6 };
const STEP = 1 / 60;
/** Long enough for every eased value to settle. */
const SETTLE_STEPS = 300;

describe("pectoralStroke", () => {
  it("moves the fins slowly and gently in turn when the fish hovers", () => {
    const stroke = pectoralStroke(HOVERING);

    expect(stroke.alternation).toBeGreaterThan(0.8);
    expect(stroke.beat).toBeLessThan(0.5);
    expect(stroke.rate).toBeLessThan(pectoralStroke(CRUISING).rate);
  });

  it("rows both fins together, gently, when the fish cruises on its tail", () => {
    const stroke = pectoralStroke(CRUISING);

    expect(stroke.alternation).toBeLessThan(0.2);
    expect(stroke.beat).toBeLessThan(0.6);
  });

  it("spreads both fins wide and beats them together during a fin-propelled pulse, then tucks them to glide", () => {
    const pulse = pectoralStroke(FIN_PULSE);
    const glide = pectoralStroke(FIN_GLIDE);

    expect(pulse.alternation).toBe(0);
    expect(pulse.beat).toBe(1);
    expect(pulse.spreadLeft).toBeGreaterThan(0.7);
    expect(pulse.spreadRight).toBeGreaterThan(0.7);
    expect(glide.beat).toBe(0);
    expect(glide.spreadLeft).toBeLessThan(-0.7);
    expect(glide.spreadRight).toBeLessThan(-0.7);
  });

  it("folds the fins against the body in a tail burst", () => {
    const stroke = pectoralStroke(BURSTING);

    expect(stroke.beat).toBe(0);
    expect(stroke.spreadLeft).toBe(-1);
    expect(stroke.spreadRight).toBe(-1);
  });

  it("spreads both fins wide to brake", () => {
    const stroke = pectoralStroke(BRAKING);

    expect(stroke.spreadLeft).toBeGreaterThan(0.8);
    expect(stroke.spreadRight).toBeGreaterThan(0.8);
  });

  it("spreads the fin on the inside of a turn and draws in the outer one", () => {
    const stroke = pectoralStroke(TURNING_LEFT);

    expect(stroke.spreadLeft).toBeGreaterThan(0.5);
    expect(stroke.spreadRight).toBeLessThan(0);
  });

  it("holds the fins as modelled when nothing pushes them", () => {
    const stroke = pectoralStroke(HOVERING);

    expect(stroke.spreadLeft).toBe(0);
    expect(stroke.spreadRight).toBe(0);
  });
});

describe("stepPectoralFins", () => {
  it("advances the left fin's phase by the stroke rate", () => {
    const fins = createPectoralFins(0);
    const stroke = pectoralStroke(HOVERING);

    stepPectoralFins(fins, stroke, 0.1);

    expect(fins.phaseLeft).toBeCloseTo(2 * Math.PI * stroke.rate * 0.1, 5);
  });

  it("keeps the right fin half a beat behind the left one while hovering", () => {
    const fins = createPectoralFins(0);
    const stroke = pectoralStroke(HOVERING);

    for (let step = 0; step < SETTLE_STEPS; step += 1) stepPectoralFins(fins, stroke, STEP);

    const lag = (fins.phaseRight - fins.phaseLeft + 4 * Math.PI) % (2 * Math.PI);
    expect(lag).toBeCloseTo(Math.PI, 2);
  });

  it("eases the fins into a new pose rather than snapping", () => {
    const fins = createPectoralFins(0);

    stepPectoralFins(fins, pectoralStroke(BURSTING), STEP);

    expect(fins.spreadLeft).toBeLessThan(0);
    expect(fins.spreadLeft).toBeGreaterThan(-1);
  });

  it("settles on the stroke's pose", () => {
    const fins = createPectoralFins(0);
    const stroke = pectoralStroke(BRAKING);

    for (let step = 0; step < SETTLE_STEPS; step += 1) stepPectoralFins(fins, stroke, STEP);

    expect(fins.spreadRight).toBeCloseTo(stroke.spreadRight, 3);
    expect(fins.beat).toBeCloseTo(stroke.beat, 3);
  });

  it("keeps the phases within one turn, so they never lose precision", () => {
    const fins = createPectoralFins(0);
    const stroke = pectoralStroke(HOVERING);

    for (let step = 0; step < 10_000; step += 1) stepPectoralFins(fins, stroke, STEP);

    expect(fins.phaseLeft).toBeLessThan(2 * Math.PI);
    expect(fins.phaseLeft).toBeGreaterThanOrEqual(0);
  });
});
