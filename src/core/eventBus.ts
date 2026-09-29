type Handler<Payload> = (payload: Payload) => void;

/** Minimal typed publish/subscribe bus. `Events` maps event names to payloads. */
export interface EventBus<Events> {
  /** Subscribes and returns an unsubscribe function. */
  on<Name extends keyof Events>(name: Name, handler: Handler<Events[Name]>): () => void;
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void;
}

export function createEventBus<Events>(): EventBus<Events> {
  const handlers = new Map<keyof Events, Set<Handler<never>>>();

  return {
    on(name, handler) {
      const set = handlers.get(name) ?? new Set();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    },
    emit(name, payload) {
      handlers.get(name)?.forEach((handler) => {
        (handler as Handler<typeof payload>)(payload);
      });
    },
  };
}
