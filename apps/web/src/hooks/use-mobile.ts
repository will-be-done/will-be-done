import * as React from "react";

const MOBILE_BREAKPOINT = 640;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export const getIsMobile = () => window.matchMedia(MOBILE_QUERY).matches;

const subscribeToMobileChanges = (onChange: () => void) => {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);

  return () => mql.removeEventListener("change", onChange);
};

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileChanges,
    getIsMobile,
    () => false,
  );
}
