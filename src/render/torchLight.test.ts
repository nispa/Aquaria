import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createTorchLight } from "./torchLight";

describe("torch light", () => {
  it("is dark until it is aimed", () => {
    expect(createTorchLight().light.intensity).toBe(0);
  });

  it("shines from the eye through the point aimed at", () => {
    const torch = createTorchLight();

    torch.aim(new Vector3(0, 1, 5), new Vector3(1, 1, 0));

    expect(torch.light.intensity).toBeGreaterThan(0);
    expect(torch.light.position.toArray()).toEqual([0, 1, 5]);
    const direction = torch.light.target.position.clone().sub(torch.light.position).normalize();
    expect(direction.x).toBeCloseTo(1 / Math.hypot(1, 5));
    expect(direction.z).toBeCloseTo(-5 / Math.hypot(1, 5));
  });

  it("goes dark when it is aimed at nothing", () => {
    const torch = createTorchLight();
    torch.aim(new Vector3(0, 1, 5), new Vector3(1, 1, 0));

    torch.aim(new Vector3(0, 1, 5), undefined);

    expect(torch.light.intensity).toBe(0);
  });
});
