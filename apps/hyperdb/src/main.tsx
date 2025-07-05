import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SubscribableDB } from "./hyperdb/subscribable-db.ts";
import { InmemDriver } from "./hyperdb/drivers/InmemDriver.ts";
import { DB } from "./hyperdb/db.ts";
import { projectsTable } from "./db.ts";
import { DBProvider } from "./react/context.ts";
import { BptreeInmemDriver } from "./hyperdb/drivers/bptree-inmem-driver.ts";

export const WrapApp = ({ children }: { children: React.ReactNode }) => {
  const [db, setDB] = useState<SubscribableDB | null>(null);

  useEffect(() => {
    // (async () => {
    //   const SQL = await initSqlJs({ locateFile: (file) => workletURL });
    //   const driver = new SqlDriver(new SQL.Database());
    //
    //   setDB(new SubscribableDB(new DB(driver, [projectsTable])));
    //   console.log("SQL", SQL);
    // })();
    setDB(new SubscribableDB(new DB(new BptreeInmemDriver(), [projectsTable])));
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
