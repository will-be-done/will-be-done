import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Route } from "@/routes/spaces.$spaceId";

type Kind = "caldav" | "ics";

const inputClass =
  "w-full min-w-0 rounded-lg bg-white/[0.05] px-3 py-2 text-[12px] text-content placeholder:text-content-tinted/40 ring-1 ring-white/10 outline-none focus:ring-white/20 transition-all";
const buttonClass =
  "flex flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[0.07] px-3 py-2 text-[12px] font-medium text-content ring-1 ring-white/12 transition-all hover:bg-white/10 hover:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass =
  "cursor-pointer rounded-lg p-2 text-content-tinted/60 transition-colors hover:bg-white/8 hover:text-content disabled:cursor-not-allowed disabled:opacity-50";

export function CalendarSection() {
  const trpc = useTRPC();
  const { spaceId } = Route.useParams();
  const [kind, setKind] = useState<Kind>("caldav");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const listQuery = useQuery(trpc.calendars.list.queryOptions({ spaceId }));
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
    setEnabled.error?.message;
  const enabled = listQuery.data?.enabled ?? true;
  const sources = listQuery.data?.sources ?? [];

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/8">
        <div className="float-left mt-0.5 mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-content-tinted ring-1 ring-white/10">
          <CalendarDays className="h-4 w-4" />
        </div>
        <h3 className="text-[13px] font-semibold text-content">Calendars</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
          Show events from your calendars on the Calendar, Today and Timeline
          pages. Events are read-only and refresh every 15 minutes.
        </p>
        <div className="clear-both" />

        {!enabled ? (
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-400/80">
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
                    "cursor-pointer rounded-md px-3 py-1 text-[12px] transition-colors",
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
                <p className="text-[11px] leading-relaxed text-content-tinted/70">
                  {kind === "caldav"
                    ? "iCloud: caldav.icloud.com with an app-specific password. Fastmail: caldav.fastmail.com. Nextcloud: your server's /remote.php/dav."
                    : "Google Calendar: Settings → your calendar → Secret address in iCal format. Outlook: Settings → Shared calendars → Publish a calendar."}
                </p>
                <button
                  type="submit"
                  disabled={!canAdd || adding}
                  className={buttonClass}
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
                <p className="text-[11px] text-red-400">{addError}</p>
              )}
            </form>
          </div>
        )}

        {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}
      </div>

      {sources.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/8">
          <div className="divide-y divide-white/8">
            {sources.map((source) => {
              const isRefreshing =
                refresh.isPending && refresh.variables?.sourceId === source.id;
              const isRemoving =
                remove.isPending && remove.variables?.sourceId === source.id;
              return (
                <div key={source.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-content">
                        {source.name}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-[10px]",
                          source.status === "error"
                            ? "text-red-400"
                            : "text-content-tinted/70",
                        )}
                      >
                        {source.kind === "caldav" ? "CalDAV" : "ICS link"} ·{" "}
                        {source.status === "error"
                          ? source.lastError
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

                  {source.kind === "caldav" && source.calendars.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {source.calendars.map((calendar) => (
                        <label
                          key={calendar.key}
                          className="flex cursor-pointer items-center gap-2 text-[12px] text-content-tinted"
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
          </div>
        </div>
      )}
    </div>
  );
}
