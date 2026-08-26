import { Bug, Clock, Database, Sun } from "lucide-react";
import { setDevtoolsEnabled, useDevtoolsEnabled } from "@/lib/devtools";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/spaces.$spaceId";
import {
  setPersistentDriverKind,
  usePersistentDriverKind,
} from "@/store/persistentDriver";
import { getDbName } from "@/store/syncClock";
import { spaceDbType } from "@/store/configs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { WorkdayFields } from "@/components/SpaceSettings/WorkdayFields";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  defaultSpacePreferences,
  packAllDailyListTimeBlocks,
  spacePreferences,
  updateSpacePreferences,
  type WorkBreak,
} from "@will-be-done/slices/space";

export function GeneralSection() {
  const { spaceId } = Route.useParams();
  const dispatch = useAsyncDispatch();
  const { data: preferences } = useAsyncSelector({
    selector: spacePreferences,
    args: {},
    defaultValue: defaultSpacePreferences,
  });
  const dayStartMinutes =
    preferences?.dayStartMinutes ?? DEFAULT_DAY_START_MINUTES;
  const dayEndMinutes = preferences?.dayEndMinutes ?? DEFAULT_DAY_END_MINUTES;
  const breaks = preferences?.breaks ?? [];
  const devtoolsEnabled = useDevtoolsEnabled();
  const dbName = getDbName({ dbType: spaceDbType, dbId: spaceId });
  const persistentDriverKind = usePersistentDriverKind(dbName);
  const indexedDBEnabled = persistentDriverKind === "indexeddb";

  const saveWorkday = (next: {
    dayStartMinutes?: number;
    dayEndMinutes?: number;
    breaks?: WorkBreak[];
  }) => {
    void (async () => {
      await dispatch(updateSpacePreferences(next));
      await dispatch(packAllDailyListTimeBlocks({}));
    })();
  };

  const toggleIndexedDB = () => {
    setPersistentDriverKind(indexedDBEnabled ? "wa-sqlite" : "indexeddb");
    window.location.assign(`/spaces/${encodeURIComponent(spaceId)}`);
  };

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="rounded-xl bg-overlay p-4 ring-1 ring-border">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-overlay text-content-tinted ring-1 ring-border">
              <Sun className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-content">
                Appearance
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
                Light, dark, or match the system setting.
              </p>
            </div>
          </div>
          <ThemeToggle className="mt-1 w-[220px] shrink-0 max-sm:w-full" />
        </div>
      </div>

      <div className="rounded-xl bg-overlay p-4 ring-1 ring-border">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-overlay text-content-tinted ring-1 ring-border">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-content">Workday</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
              Timed tasks fill this window and skip breaks. Drag a block to keep
              it where you put it.
            </p>

            <WorkdayFields
              className="mt-3"
              dayStartMinutes={dayStartMinutes}
              dayEndMinutes={dayEndMinutes}
              breaks={breaks}
              onChange={saveWorkday}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-overlay ring-1 ring-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-overlay text-content-tinted ring-1 ring-border">
              <Database className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-content">
                IndexedDB storage
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
                Use the IndexedDB HyperDB driver for every local database
                instead of wa-sqlite.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={indexedDBEnabled}
            aria-label="Use IndexedDB storage"
            onClick={toggleIndexedDB}
            className={cn(
              "mt-1 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full px-0.5 outline-none ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
              indexedDBEnabled
                ? "bg-accent ring-accent/30"
                : "bg-overlay ring-border hover:bg-overlay-hover",
            )}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full transition-transform",
                indexedDBEnabled
                  ? "translate-x-6 bg-white"
                  : "translate-x-0 bg-content-tinted/70",
              )}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-overlay ring-1 ring-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-overlay text-content-tinted ring-1 ring-border">
              <Bug className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-content">
                HyperDB Devtool
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
                Render the HyperDB debugging panel from the app root.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={devtoolsEnabled}
            aria-label="Enable HyperDB Devtool"
            onClick={() => setDevtoolsEnabled(!devtoolsEnabled)}
            className={cn(
              "mt-1 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full px-0.5 outline-none ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
              devtoolsEnabled
                ? "bg-accent ring-accent/30"
                : "bg-overlay ring-border hover:bg-overlay-hover",
            )}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full transition-transform",
                devtoolsEnabled
                  ? "translate-x-6 bg-white"
                  : "translate-x-0 bg-content-tinted/70",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
