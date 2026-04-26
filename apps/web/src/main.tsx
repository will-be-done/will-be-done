import "./fixGlobal";
// import { scan } from "react-scan";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RouterProvider, createRouter } from "@tanstack/react-router";
// import "temporal-polyfill/global";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import reportWebVitals from "./reportWebVitals.ts";

// scan({
//   enabled: true,
// });

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Detect Electron desktop app
if (window.desktopApi) {
  document.documentElement.classList.add("is-desktop-app");
  if (navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Macintosh")) {
    document.documentElement.classList.add("is-macos");
  }
}

const isSafariBrowser = (() => {
  const { userAgent, vendor } = navigator;
  return /Safari/i.test(userAgent)
    && /Apple/i.test(vendor)
    && !/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|DuckDuckGo/i.test(userAgent);
})();

if (isSafariBrowser) {
  document.documentElement.classList.add("is-safari");
}

if (/Firefox|FxiOS/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-firefox");
}

// Render the app
const rootElement = document.getElementById("root");
if (rootElement && !rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log);
