import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SubscribableDB } from "./hyperdb/subscribable-db.ts";
import { DB, execAsync } from "./hyperdb/db.ts";
import { projectsTable } from "./db.ts";
import { DBProvider } from "./react/context.ts";
import { BptreeInmemDriver } from "./hyperdb/drivers/bptree-inmem-driver.ts";
import { CachedDB } from "./hyperdb/cachedDB.ts";
import { initWasmIDBAsync } from "./hyperdb/initWaSqlite.ts";

export const WrapApp = ({ children }: { children: React.ReactNode }) => {
  const [db, setDB] = useState<SubscribableDB | null>(null);

  useEffect(() => {
    (async () => {
      const primaryDriver = await initWasmIDBAsync();
      const primary = new DB(primaryDriver);

      const cache = new DB(new BptreeInmemDriver());
      const cachedDB = new CachedDB(primary, cache);

      await execAsync(cachedDB.loadTables([projectsTable]));

      setDB(new SubscribableDB(cachedDB));
    })();
  }, []);

  return db && <DBProvider value={db}>{children}</DBProvider>;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WrapApp>
      <App />
    </WrapApp>
    {/* <DBProvider value={db}> */}
    {/*   <WrapApp /> */}
    {/*   </WrapApp> */}
    {/* </DBProvider> */}
  </StrictMode>,
);
