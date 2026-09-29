import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./eventBus";

interface TestEvents {
  feed: { x: number; y: number };
  tap: undefined;
}

describe("createEventBus", () => {
  it("delivers emitted payloads to subscribers of that event", () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on("feed", handler);

    bus.emit("feed", { x: 1, y: 2 });

    expect(handler).toHaveBeenCalledWith({ x: 1, y: 2 });
  });

  it("does not deliver events to subscribers of other events", () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on("tap", handler);

    bus.emit("feed", { x: 0, y: 0 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribing", () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on("tap", handler);

    unsubscribe();
    bus.emit("tap", undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to every subscriber", () => {
    const bus = createEventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    bus.on("tap", first);
    bus.on("tap", second);

    bus.emit("tap", undefined);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
