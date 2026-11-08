import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  formatDistanceToNow,
  formatDuration,
  intervalToDuration,
} from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/spaces.$spaceId";
import { SettingsGroup, settingsButtonClass } from "./SettingsUI";

type Kind = "caldav" | "ics";

const syncWindowLabels = {
  "2-weeks": "2 weeks back",
  "1-month": "1 month back",
  "3-months": "3 months back",
  "6-months": "6 months back",
  all: "All events",
} as const;
type SyncWindow = keyof typeof syncWindowLabels;
const isSyncWindow = (value: string): value is SyncWindow =>
  value in syncWindowLabels;

const inputClass =
  "w-full min-w-0 rounded-lg bg-white/[0.05] px-3 py-2 text-[13px] text-content placeholder:text-content-tinted/40 ring-1 ring-white/10 outline-none focus:ring-white/20 transition-all";
const iconButtonClass =
  "cursor-pointer rounded-lg p-2 text-content-tinted/60 transition-colors hover:bg-white/8 hover:text-content disabled:cursor-not-allowed disabled:opacity-50";

export function CalendarSection() {
  const trpc = useTRPC();
  const { spaceId } = Route.useParams();
  const [kind, setKind] = useState<Kind>("caldav");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const listQuery = useQuery({
    ...trpc.calendars.list.queryOptions({ spaceId }),
    // A new source's first sync runs after connecting returns.
    refetchInterval: (query) =>
      query.state.data?.sources.some((source) => source.status === "pending")
        ? 2000
        : false,
  });
  const refetch = async () => {
    await listQuery.refetch();
  };

  const addCalDav = useMutation(
    trpc.calendars.addCalDav.mutationOptions({ onSettled: refetch }),
  );
  const addIcs = useMutation(
    trpc.calendars.addIcs.mutationOptions({ onSettled: refetch }),
  );
  const refresh = useMutation(
    trpc.calendars.refresh.mutationOptions({ onSettled: refetch }),
  );
  const remove = useMutation(
    trpc.calendars.remove.mutationOptions({ onSettled: refetch }),
  );
  const setEnabled = useMutation(
    trpc.calendars.setCalendarEnabled.mutationOptions({ onSettled: refetch }),
  );
  const setSyncWindow = useMutation(
    trpc.calendars.setSyncWindow.mutationOptions({ onSettled: refetch }),
  );

  const adding = addCalDav.isPending || addIcs.isPending;
  const canAdd =
    url.trim() !== "" &&
    (kind === "ics" || (username.trim() !== "" && password !== ""));

  const handleAdd = () => {
    if (!canAdd || adding) return;
    const onSuccess = () => {
      setUrl("");
      setUsername("");
      setPassword("");
    };
    if (kind === "caldav") {
      addCalDav.mutate({ spaceId, url, username, password }, { onSuccess });
    } else {
      addIcs.mutate({ spaceId, url }, { onSuccess });
    }
  };

  const removeSource = (sourceId: string) => {
    if (
      window.confirm(
        "Remove this calendar? Its events disappear from every device.",
      )
    ) {
      remove.mutate({ sourceId });
    }
  };

  const addError =
    kind === "caldav" ? addCalDav.error?.message : addIcs.error?.message;
  const error =
    listQuery.error?.message ??
    refresh.error?.message ??
    remove.error?.message ??
    setEnabled.error?.message ??
    setSyncWindow.error?.message;
  const enabled = listQuery.data?.enabled ?? true;
  const sources = listQuery.data?.sources ?? [];
  const syncIntervalMs = listQuery.data?.syncIntervalMs ?? null;

  return (
    <>
      <SettingsGroup title="Connect a calendar">
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-content-tinted/60">
            Show events from your calendars on the Calendar, Today and Timeline
            pages. Events are read-only
            {syncIntervalMs !== null &&
              ` and refresh every ${formatDuration(intervalToDuration({ start: 0, end: syncIntervalMs }))}`}
            .
          </p>

          {!enabled ? (
            <div className="mt-3 flex items-start gap-1.5 text-[12px] text-amber-400/80">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>
                Calendar connections are turned off on this server. The server
                admin can enable them by setting WBD_CALENDAR_ENCRYPTION_KEY.
              </span>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex self-start rounded-lg p-0.5 ring-1 ring-white/10">
                {(
                  [
                    ["caldav", "CalDAV account"],
                    ["ics", "Calendar link (ICS)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1 text-[13px] transition-colors",
                      kind === value
                        ? "bg-white/10 font-medium text-content"
                        : "text-content-tinted hover:text-content",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAdd();
                }}
              >
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                    kind === "caldav"
                      ? "Server address, e.g. https://caldav.icloud.com"
                      : "https://… or webcal://… link to an .ics feed"
                  }
                  className={inputClass}
                  autoComplete="off"
                />
                {kind === "caldav" && (
                  <div className="flex gap-2">
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username or email"
                      className={inputClass}
                      autoComplete="off"
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="App password"
                      className={inputClass}
                      autoComplete="new-password"
                    />
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[12px] leading-relaxed text-content-tinted/60">
                    {kind === "caldav"
                      ? "iCloud: caldav.icloud.com with an app-specific password. Fastmail: caldav.fastmail.com. Nextcloud: your server's /remote.php/dav."
                      : "Google Calendar: Settings → your calendar → Secret address in iCal format. Outlook: Settings → Shared calendars → Publish a calendar."}
                  </p>
                  <button
                    type="submit"
                    disabled={!canAdd || adding}
                    className={settingsButtonClass}
                  >
                    {adding ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {adding ? "Connecting…" : "Connect"}
                  </button>
                </div>
                {addError && (
                  <p className="text-[12px] text-red-400">{addError}</p>
                )}
              </form>
            </div>
          )}

          {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}
        </div>
      </SettingsGroup>

      {sources.length > 0 && (
        <SettingsGroup title="Connected calendars">
          {sources.map((source) => {
            const isRefreshing =
              refresh.isPending && refresh.variables?.sourceId === source.id;
            const isRemoving =
              remove.isPending && remove.variables?.sourceId === source.id;
            const pendingSyncWindow =
              setSyncWindow.isPending &&
              setSyncWindow.variables?.sourceId === source.id
                ? setSyncWindow.variables.syncWindow
                : null;
            return (
              <div key={source.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-content">
                      {source.name}
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[12px]",
                        source.status === "error"
                          ? "text-red-400"
                          : "text-content-tinted/60",
                      )}
                    >
                      {source.kind === "caldav" ? "CalDAV" : "ICS link"} ·{" "}
                      {source.status === "error"
                        ? source.lastError
                        : source.status === "pending"
                          ? "Syncing…"
                          : source.lastSyncedAt
                            ? `Updated ${formatDistanceToNow(source.lastSyncedAt, { addSuffix: true })}`
                            : "Not synced yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Refresh calendar"
                    title="Refresh now"
                    onClick={() => refresh.mutate({ sourceId: source.id })}
                    disabled={isRefreshing || !enabled}
                    className={iconButtonClass}
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5",
                        isRefreshing && "animate-spin",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove calendar"
                    title="Remove"
                    onClick={() => removeSource(source.id)}
                    disabled={isRemoving}
                    className={cn(
                      iconButtonClass,
                      "hover:bg-red-500/10 hover:text-red-400",
                    )}
                  >
                    {isRemoving ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-content-tinted/60">
                  <span>Sync</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={pendingSyncWindow !== null || !enabled}
                      className="flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 text-content-tinted transition-colors hover:bg-white/8 hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {syncWindowLabels[pendingSyncWindow ?? source.syncWindow]}
                      {pendingSyncWindow ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Past events</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={source.syncWindow}
                        onValueChange={(value) => {
                          if (
                            isSyncWindow(value) &&
                            value !== source.syncWindow
                          ) {
                            setSyncWindow.mutate({
                              sourceId: source.id,
                              syncWindow: value,
                            });
                          }
                        }}
                      >
                        {Object.entries(syncWindowLabels).map(
                          ([value, label]) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                              {label}
                            </DropdownMenuRadioItem>
                          ),
                        )}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {source.kind === "caldav" && source.calendars.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {source.calendars.map((calendar) => (
                      <label
                        key={calendar.key}
                        className="flex cursor-pointer items-center gap-2 text-[13px] text-content-tinted"
                      >
                        <input
                          type="checkbox"
                          checked={calendar.enabled}
                          disabled={setEnabled.isPending || !enabled}
                          onChange={(e) =>
                            setEnabled.mutate({
                              sourceId: source.id,
                              calendarKey: calendar.key,
                              enabled: e.target.checked,
                            })
                          }
                          className="accent-accent"
                        />
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              calendar.color ?? "rgb(148 163 184)",
                          }}
                        />
                        <span className="truncate">{calendar.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </SettingsGroup>
      )}
    </>
  );
}
