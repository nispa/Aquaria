import { describe, expect, it } from "vitest";
import { collect, headingGap, startStyle } from "./harness";
import { lapRadius, patrolStyle } from "./patrol";

describe("patrol", () => {
  it("picks a home its whole lap fits in", () => {
    const patrolling = startStyle(patrolStyle, { radiusBodyLengths: 4 });
    const { room, length } = patrolling.context;
    const radius = patrolling.params.radiusBodyLengths * length;

    const { home } = patrolling.state;

    expect(home.x - radius).toBeGreaterThanOrEqual(room.min.x);
    expect(home.x + radius).toBeLessThanOrEqual(room.max.x);
    expect(home.z - radius).toBeGreaterThanOrEqual(room.min.z);
    expect(home.z + radius).toBeLessThanOrEqual(room.max.z);
  });

  it("shrinks its lap to fit a narrow habitat", () => {
    const patrolling = startStyle(patrolStyle, { radiusBodyLengths: 20 });

    const radius = lapRadius(patrolling.params, patrolling.context);

    expect(radius).toBe(1);
  });

  it("heads along its lap when it is on it", () => {
    const patrolling = startStyle(patrolStyle);
    const { state, context, params } = patrolling;
    state.turn = 1;
    context.position.copy(state.home).x += lapRadius(params, context);

    patrolling.run(1 / 60);

    expect(headingGap(state.yaw, Math.PI / 2)).toBeLessThan(0.1);
  });

  it("heads back towards its lap from far away", () => {
    const patrolling = startStyle(patrolStyle);
    const { state, context, params } = patrolling;
    context.position.copy(state.home).x += lapRadius(params, context) * 4;

    patrolling.run(1 / 60);

    expect(headingGap(state.yaw, Math.PI)).toBeLessThan(Math.PI / 3);
  });

  it("changes the way round now and then", () => {
    const turns = collect(startStyle(patrolStyle), 120, (state) => state.turn);

    expect(new Set(turns)).toEqual(new Set([1, -1]));
  });

  it("swims its lap at the height of its home", () => {
    const patrolling = startStyle(patrolStyle);

    patrolling.run(5);

    expect(patrolling.state.height).toBe(patrolling.state.home.y);
  });
});
