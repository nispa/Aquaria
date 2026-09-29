import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createCurrentField } from "./current";

describe("createCurrentField", () => {
  it("returns direction times strength when there is no turbulence", () => {
    const field = createCurrentField({ direction: [2, 0, 0], strength: 0.5, turbulence: 0 });

    const velocity = field.sample(new Vector3(1, 2, 3), 10, new Vector3());

    expect(velocity.toArray()).toEqual([0.5, 0, 0]);
  });

  it("varies over space and time when turbulent", () => {
    const field = createCurrentField({ direction: [1, 0, 0], strength: 0.5, turbulence: 1 });

    const a = field.sample(new Vector3(0, 0, 0), 0, new Vector3());
    const b = field.sample(new Vector3(3, 1, -2), 4, new Vector3());

    expect(a.equals(b)).toBe(false);
  });

  it("keeps turbulent velocity within strength times (1 + turbulence)", () => {
    const field = createCurrentField({ direction: [0, 0, 1], strength: 0.2, turbulence: 0.5 });
    const out = new Vector3();

    const speeds = Array.from({ length: 200 }, (_, index) =>
      field
        .sample(new Vector3(index * 0.37, index * 0.11, -index * 0.23), index * 0.5, out)
        .length(),
    );

    expect(Math.max(...speeds)).toBeLessThanOrEqual(0.2 * 1.5 + 1e-9);
  });

  it("writes into the provided vector instead of allocating", () => {
    const field = createCurrentField({ direction: [1, 0, 0], strength: 1, turbulence: 0 });
    const out = new Vector3();

    const result = field.sample(new Vector3(), 0, out);

    expect(result).toBe(out);
  });
});
