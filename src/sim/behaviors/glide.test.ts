import { describe, expect, it } from "vitest";
import { glideStyle } from "./glide";
import { collect, HARNESS_STEP, startStyle } from "./harness";

describe("glide", () => {
  it("loops one way, then the other, like a figure eight", () => {
    const yaws = collect(startStyle(glideStyle), 60, (state) => state.yaw);

    const rates = yaws.slice(1).map((yaw, index) => (yaw - (yaws[index] ?? yaw)) / HARNESS_STEP);
    expect(Math.max(...rates)).toBeGreaterThan(0.2);
    expect(Math.min(...rates)).toBeLessThan(-0.2);
  });

  it("turns a full circle before changing way", () => {
    const yaws = collect(startStyle(glideStyle), 60, (state) => state.yaw);

    expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(Math.PI * 1.5);
  });

  it("rises and sinks through much of its room", () => {
    const gliding = startStyle(glideStyle);
    const { room } = gliding.context;

    const heights = collect(gliding, 30, (state) => state.height);

    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(
      (room.max.y - room.min.y) * 0.4,
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(room.min.y);
    expect(Math.max(...heights)).toBeLessThanOrEqual(room.max.y);
  });

  it("swims slowly with a lazy tail", () => {
    const gliding = startStyle(glideStyle);

    gliding.run(1);

    expect(gliding.state.speed).toBeLessThan(1);
    expect(gliding.state.thrust).toBeLessThan(1);
  });
});
