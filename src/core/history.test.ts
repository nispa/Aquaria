import { describe, expect, it } from "vitest";
import { createHistory } from "./history";

describe("createHistory", () => {
  it("goes back to the state before the last change", () => {
    const history = createHistory("a", 10);
    history.record("b");

    expect(history.undo()).toBe("a");
  });

  it("goes forward again to the change it undid", () => {
    const history = createHistory("a", 10);
    history.record("b");
    history.undo();

    expect(history.redo()).toBe("b");
  });

  it("forgets what was undone once a new change is made", () => {
    const history = createHistory("a", 10);
    history.record("b");
    history.undo();
    history.record("c");

    expect(history.redo()).toBeUndefined();
  });

  it("has nothing to undo at the start", () => {
    expect(createHistory("a", 10).undo()).toBeUndefined();
  });

  it("keeps only the latest changes", () => {
    const history = createHistory(0, 2);
    for (const state of [1, 2, 3]) history.record(state);

    expect([history.undo(), history.undo(), history.undo()]).toEqual([2, 1, undefined]);
  });

  it("says whether it can go back or forward", () => {
    const history = createHistory("a", 10);
    history.record("b");

    expect([history.canUndo(), history.canRedo()]).toEqual([true, false]);
  });
});
