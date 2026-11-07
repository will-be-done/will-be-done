import { Bug, Database } from "lucide-react";
import { setDevtoolsEnabled, useDevtoolsEnabled } from "@/lib/devtools";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/spaces.$spaceId";
import {
  setPersistentDriverKind,
  usePersistentDriverKind,
} from "@/store/persistentDriver";
import { getDbName } from "@/store/syncClock";
import { spaceDbType } from "@/store/configs";

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
    <div className="flex flex-col gap-3 px-5 py-5">
      <SettingSwitch
        icon={<Database className="h-4 w-4" />}
        title="IndexedDB storage"
        label="Use IndexedDB storage"
        description="Use the IndexedDB HyperDB driver for every local database instead of wa-sqlite."
        checked={indexedDBEnabled}
        onChange={toggleIndexedDB}
      />
      <SettingSwitch
        icon={<Bug className="h-4 w-4" />}
        title="HyperDB Devtool"
        label="Enable HyperDB Devtool"
        description="Render the HyperDB debugging panel from the app root."
        checked={devtoolsEnabled}
        onChange={() => setDevtoolsEnabled(!devtoolsEnabled)}
      />
    </div>
  );
}

function SettingSwitch({
  icon,
  title,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/8 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-content-tinted ring-1 ring-white/10">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-content">{title}</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={onChange}
          className={cn(
            "mt-1 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full px-0.5 outline-none ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
            checked
              ? "bg-accent ring-accent/30"
              : "bg-white/[0.07] ring-white/12 hover:bg-white/10 hover:ring-white/20",
          )}
        >
          <span
            className={cn(
              "h-4 w-4 rounded-full transition-transform",
              checked
                ? "translate-x-6 bg-white"
                : "translate-x-0 bg-content-tinted/70",
            )}
          />
        </button>
      </div>
    </div>
  );
}
