import { useMemo } from "react";
import { create } from "zustand";
import { useUnmount } from "../utils";

export type GlobalCallback<E = unknown> = (e: E) => void;

type EventsStore = {
  callbacks: Map<keyof WindowEventMap, Map<string, GlobalCallback>>;
  events: { set: Set<keyof WindowEventMap> };
  addEvent: (event: keyof WindowEventMap) => void;
};

export const useEventTypes = create<EventsStore>((set) => ({
  callbacks: new Map<keyof WindowEventMap, Map<string, GlobalCallback>>(),
  events: { set: new Set<keyof WindowEventMap>() },
  addEvent: (event: keyof WindowEventMap) =>
    set((state) => {
      if (state.events.set.has(event)) return state;
      state.events.set.add(event);

      return {
        events: { set: state.events.set },
      };
    }),
}));

export const useKeyPressed = <K extends keyof WindowEventMap>(
  key: K,
  cb: GlobalCallback<WindowEventMap[K]>,
) => {
  const addEvent = useEventTypes((st) => st.addEvent);
  const callbacks = useEventTypes((st) => st.callbacks);
  const id = useMemo(() => Math.random().toString(36).slice(2), []);

  let cbMap = callbacks.get(key);
  if (!cbMap) {
    cbMap = new Map<string, GlobalCallback>();
    callbacks.set(key, cbMap);
  }
  cbMap.set(id, cb as GlobalCallback);
  addEvent(key);

  useUnmount(() => {
    cbMap.delete(id);
  });
};
