import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BptreeInmemDriver,
  DB,
  SubscribableDB,
  execSync,
} from "@will-be-done/hyperdb-lib";
import { DBProvider } from "@will-be-done/hyperdb-lib/react";
import App from "./App.tsx";
import { hyperdbDemoTables, installTaskStatsHooks } from "./db.ts";
import "./index.css";

const baseDb = new DB(new BptreeInmemDriver());
execSync(baseDb.loadTables(hyperdbDemoTables));
const db = new SubscribableDB(baseDb);
installTaskStatsHooks(db);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DBProvider value={db}>
      <App />
    </DBProvider>
  </StrictMode>,
);
