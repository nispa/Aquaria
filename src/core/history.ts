/**
 * Undo and redo over snapshots of a state: the caller records the state
 * after each change; undo and redo give back the one to show. Older
 * snapshots than `limit` changes ago are forgotten.
 */
export interface History<State> {
  /** Records the state after a change; what was undone can no longer be redone. */
  record(state: State): void;
  /** The state before the last change, or undefined when there is none. */
  undo(): State | undefined;
  /** The state of the change last undone, or undefined when there is none. */
  redo(): State | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function createHistory<State>(initial: State, limit: number): History<State> {
  const states: State[] = [initial];
  let current = 0;
  return {
    record(state) {
      states.splice(current + 1);
      states.push(state);
      if (states.length > limit + 1) states.shift();
      current = states.length - 1;
    },
    undo() {
      if (current === 0) return undefined;
      current -= 1;
      return states[current];
    },
    redo() {
      if (current === states.length - 1) return undefined;
      current += 1;
      return states[current];
    },
    canUndo: () => current > 0,
    canRedo: () => current < states.length - 1,
  };
}
