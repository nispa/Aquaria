import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { bubblePosition, bubbleStreamsFromProps, type BubbleStream } from "./bubbles";
import type { Prop } from "./layout";

const stream: BubbleStream = { x: 1, z: -2, baseY: 0.2, surfaceY: 3 };
const still = new Vector3(0, 0, 0);

describe("bubblePosition", () => {
  it("starts at the stream origin", () => {
    const position = bubblePosition(stream, 0, 0, still, 0.5, new Vector3());

    expect(position.y).toBeCloseTo(0.2);
  });

  it("rises over time", () => {
    const early = bubblePosition(stream, 0, 1, still, 0.5, new Vector3());
    const late = bubblePosition(stream, 0, 2, still, 0.5, new Vector3());

    expect(late.y).toBeGreaterThan(early.y);
  });

  it("wraps back to the origin after reaching the surface", () => {
    const travelTime = (stream.surfaceY - stream.baseY) / 0.5;

    const position = bubblePosition(stream, 0, travelTime + 0.1, still, 0.5, new Vector3());

    expect(position.y).toBeLessThan(stream.baseY + 0.2);
  });

  it("never goes above the surface", () => {
    const heights = Array.from(
      { length: 300 },
      (_, index) => bubblePosition(stream, index / 300, index * 0.13, still, 0.5, new Vector3()).y,
    );

    expect(Math.max(...heights)).toBeLessThanOrEqual(stream.surfaceY);
  });

  it("drifts downstream as it rises", () => {
    const current = new Vector3(0.1, 0, 0);

    const low = bubblePosition(stream, 0, 0.5, current, 0.5, new Vector3());
    const high = bubblePosition(stream, 0, 4, current, 0.5, new Vector3());

    expect(high.x).toBeGreaterThan(low.x);
  });

  it("spreads bubbles of one stream along its height", () => {
    const first = bubblePosition(stream, 0.1, 0, still, 0.5, new Vector3());
    const second = bubblePosition(stream, 0.6, 0, still, 0.5, new Vector3());

    expect(first.y).not.toBeCloseTo(second.y);
  });
});

describe("bubbleStreamsFromProps", () => {
  const props: Prop[] = [
    { kind: "starfish", color: "#fff", x: 0, z: -1, size: 0.2, rotation: 0, seed: 1 },
    { kind: "rock", color: "#666", x: 1, z: -2, size: 0.5, rotation: 0, seed: 2 },
    { kind: "rock", color: "#666", x: -1, z: -3, size: 0.4, rotation: 0, seed: 3 },
  ];

  it("starts a stream on top of each rock, up to the limit", () => {
    const streams = bubbleStreamsFromProps(props, 3, 1);

    expect(streams).toEqual([{ x: 1, z: -2, baseY: 0.15, surfaceY: 3 }]);
  });

  it("ignores props that are not rocks", () => {
    expect(bubbleStreamsFromProps(props, 3, 10)).toHaveLength(2);
  });
});

describe("bubbles switched off", () => {
  it("starts no stream when the scene turns bubbles off", () => {
    const rocks: Prop[] = [
      { kind: "rock", color: "#666", x: 1, z: -2, size: 0.5, rotation: 0, seed: 1 },
    ];

    expect(bubbleStreamsFromProps(rocks, 3, 5, false)).toEqual([]);
  });
});
