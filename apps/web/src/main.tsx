import "./fixGlobal";
// import { scan } from "react-scan";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import { RouterProvider } from "@tanstack/react-router";
import {
  action as slicesAction,
  selector as slicesSelector,
} from "@will-be-done/slices";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { action as webAction, selector as webSelector } from "@/store/builders";
// import "temporal-polyfill/global";

// Import the generated route tree

import reportWebVitals from "./reportWebVitals.ts";
import { initSentry } from "./instrument.ts";
import { getRouter } from "./router.tsx";
import { TawkIdentity } from "./components/Tawk/TawkIdentity.tsx";

// scan({
//   enabled: true,
// });

// Create the router before Sentry so navigation tracing can use its route tree.
const router = getRouter();
const sentryEnabled = initSentry(router);

const traceStartOn =
  getDevtoolsEnabled() || process.env.NODE_ENV === "development"
    ? "load"
    : "devtoolOpen";
slicesSelector.configure({ trace: { enabled: true, startOn: traceStartOn } });
slicesAction.configure({ trace: { enabled: true, startOn: traceStartOn } });
webSelector.configure({ trace: { enabled: true, startOn: traceStartOn } });
webAction.configure({ trace: { enabled: true, startOn: traceStartOn } });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Detect Electron desktop app
if (window.desktopApi) {
  document.documentElement.classList.add("is-desktop-app");
  if (
    navigator.platform.startsWith("Mac") ||
    navigator.userAgent.includes("Macintosh")
  ) {
    document.documentElement.classList.add("is-macos");
  }
}

const isSafariBrowser = (() => {
  const { userAgent, vendor } = navigator;
  return (
    /Safari/i.test(userAgent) &&
    /Apple/i.test(vendor) &&
    !/Chrome|CriOS|Chromium|Edg|EdgiOS|OPR|OPiOS|Firefox|FxiOS|DuckDuckGo/i.test(
      userAgent,
    )
  );
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
  const root = createRoot(
    rootElement,
    sentryEnabled
      ? {
          onUncaughtError: Sentry.reactErrorHandler(),
          onCaughtError: Sentry.reactErrorHandler(),
          onRecoverableError: Sentry.reactErrorHandler(),
        }
      : undefined,
  );
  root.render(
    <>
      <TawkIdentity />
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    </>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log);
