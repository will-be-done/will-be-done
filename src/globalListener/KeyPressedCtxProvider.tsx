import { useEffect, PropsWithChildren } from "react";
import { useEventTypes } from "./hooks";

// eslint-disable-next-line mobx/missing-observer
export const KeyPressedCtxProvider = ({ children }: PropsWithChildren) => {
  const callbacks = useEventTypes((st) => st.callbacks);
  const events = useEventTypes((st) => st.events);

  useEffect(() => {
    const cbs: [string, (e: unknown) => void][] = [];

    for (const [event, set] of callbacks) {
      const cb = (e: unknown) => {
        for (const [, cb] of set) {
          cb(e);
        }
      };

      window.addEventListener(event, cb);
      cbs.push([event, cb]);
    }

    return () => {
      for (const [event, cb] of cbs) {
        window.removeEventListener(event, cb);
      }
    };

    // NOTE: events is important here
  }, [callbacks, events]);

  return children;
};
