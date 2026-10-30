export const isDemoMode = () =>
  import.meta.env.VITE_DEMO_MODE === "true" ||
  (typeof window !== "undefined" &&
    window.location.hostname === "demo.will-be-done.app");
