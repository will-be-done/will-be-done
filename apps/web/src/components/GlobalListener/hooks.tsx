import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";

type GlobalCallback<E = unknown> = (e: E) => void;

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

// Registers in an effect: adding an event type updates the store, which must
// not happen while rendering, or React warns about updating the provider.
export const useGlobalListener = <K extends keyof WindowEventMap>(
  key: K,
  cb: GlobalCallback<WindowEventMap[K]>,
) => {
  const cbRef = useRef(cb);
  useLayoutEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    const { callbacks, addEvent } = useEventTypes.getState();
    let cbMap = callbacks.get(key);
    if (!cbMap) {
      cbMap = new Map<string, GlobalCallback>();
      callbacks.set(key, cbMap);
    }
    const id = Math.random().toString(36).slice(2);
    cbMap.set(id, (e) => cbRef.current(e as WindowEventMap[K]));
    addEvent(key);
    return () => {
      cbMap.delete(id);
    };
  }, [key]);
};
