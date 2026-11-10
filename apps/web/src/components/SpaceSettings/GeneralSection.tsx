import { setDevtoolsEnabled, useDevtoolsEnabled } from "@/lib/devtools";
import { Route } from "@/routes/spaces.$spaceId";
import {
  setPersistentDriverKind,
  usePersistentDriverKind,
} from "@/store/persistentDriver";
import { getDbName } from "@/store/syncClock";
import { spaceDbType } from "@/store/configs";
import { SettingsGroup, SettingsRow, SettingsSwitch } from "./SettingsUI";

export function GeneralSection() {
  const { spaceId } = Route.useParams();
  const devtoolsEnabled = useDevtoolsEnabled();
  const dbName = getDbName({ dbType: spaceDbType, dbId: spaceId });
  const persistentDriverKind = usePersistentDriverKind(dbName);
  const indexedDBEnabled = persistentDriverKind === "indexeddb";

  const toggleIndexedDB = () => {
    setPersistentDriverKind(indexedDBEnabled ? "wa-sqlite" : "indexeddb");
    window.location.assign(`/spaces/${encodeURIComponent(spaceId)}`);
  };

  return (
    <>
      <SettingsGroup title="Storage">
        <SettingsRow
          title="IndexedDB storage"
          description="Use the IndexedDB HyperDB driver for every local database instead of wa-sqlite."
        >
          <SettingsSwitch
            label="Use IndexedDB storage"
            checked={indexedDBEnabled}
            onChange={toggleIndexedDB}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Developer">
        <SettingsRow
          title="HyperDB Devtool"
          description="Render the HyperDB debugging panel from the app root."
        >
          <SettingsSwitch
            label="Enable HyperDB Devtool"
            checked={devtoolsEnabled}
            onChange={() => setDevtoolsEnabled(!devtoolsEnabled)}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
