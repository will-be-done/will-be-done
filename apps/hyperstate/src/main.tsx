import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StoreProvider } from "./react/context.ts";
import { appStore } from "./models.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider value={appStore()}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
