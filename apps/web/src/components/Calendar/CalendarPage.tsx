import { useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createProjectTask,
  inboxProjectId,
  scheduleTask,
  setDailyEntryTime,
  updateTask,
  updateTemplate,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { formatTaskTime } from "@/lib/taskTime.ts";
import { captureWebAnalytics } from "@/lib/analytics";
import { promptDialog } from "@/components/ui/prompt-dialog-service.ts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavBar } from "@/components/NavBar/NavBar";
import { SyncIndicator } from "@/components/Sidebar/SyncIndicator";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { useCurrentDMY } from "@/components/DaysBoard/hooks.tsx";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import {
  type CalendarView,
  calendarTitle,
  calendarViews,
  shiftAnchor,
  visibleDates,
} from "./calendarModel";
import { type DragCommit, useCalendarDrag } from "./calendarDrag";
import { useCalendarEvents } from "./useCalendarEvents";
import {
  type DayActions,
  MonthCell,
  PlanCell,
  WeekdayHeader,
} from "./DayCells";
import { TimeGridView } from "./TimeGridView";
import { useExternalTaskDrop } from "./useExternalTaskDrop";
import { ProjectsSplit } from "@/components/ProjectView/ProjectsSplit.tsx";

const viewLabels: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  plan: "Plan",
};

const urlDate = (date: Date) => format(date, "yyyy-MM-dd");

const navButtonClass =
  "flex h-8 items-center justify-center rounded-md px-2 text-sm text-content-tinted transition-colors hover:bg-white/5 hover:text-content";

export const CalendarPage = ({
  anchor,
  view,
  projectId,
}: {
  anchor: Date;
  view: CalendarView;
  projectId: string;
}) => {
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const dispatch = useAsyncDispatch();
  const today = useCurrentDMY();
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });

  const days = useMemo(() => visibleDates(view, anchor), [view, anchor]);
  const eventsByDate = useCalendarEvents(days);

  const onCommit: DragCommit = useCallback(
    ({ event, mode, target, durationMinutes }) => {
      if (event.templateId !== null) {
        const template =
          mode === "resize"
            ? durationMinutes !== event.durationMinutes && { durationMinutes }
            : target?.time !== undefined &&
              target.time !== event.time && { time: target.time };
        if (template) {
          void dispatch(updateTemplate({ id: event.templateId, template }));
        }
        return;
      }
      if (mode === "resize") {
        if (durationMinutes !== event.durationMinutes) {
          void dispatch(
            updateTask({ id: event.taskId, task: { durationMinutes } }),
          );
        }
        return;
      }
      if (!target) return;

      if (target.date !== event.date) {
        void dispatch(
          scheduleTask({
            taskId: event.taskId,
            date: target.date,
            position: "append",
            // Month and plan cells keep the time.
            ...(target.time === undefined ? {} : { time: target.time }),
          }),
        );
      } else if (target.time !== undefined && target.time !== event.time) {
        void dispatch(
          setDailyEntryTime({ taskId: event.taskId, time: target.time }),
        );
      }
    },
    [dispatch],
  );

  const onCreate = useCallback(
    (date: string, time: string | null) => {
      void (async () => {
        const title = (
          await promptDialog(
            time ? `New task at ${formatTaskTime(time)}` : "New task",
          )
        )?.trim();
        if (!title || !inboxId) return;

        const task = await dispatch(
          createProjectTask({
            projectId: inboxId,
            position: "prepend",
            taskAttrs: { title },
          }),
        );
        await dispatch(
          scheduleTask({ taskId: task.id, date, position: "append", time }),
        );
        captureWebAnalytics({
          name: "task_created",
          properties: { creation_method: "add_button", location: "calendar" },
        });
      })();
    },
    [dispatch, inboxId],
  );

  const onOpenDay = useCallback(
    (date: Date) => {
      void navigate({
        to: "/spaces/$spaceId/calendar/$date",
        params: { spaceId, date: urlDate(date) },
        search: { view: "day", projectId },
      });
    },
    [navigate, spaceId, projectId],
  );

  const actions: DayActions = useMemo(
    () => ({ onCommit, onCreate, onOpenDay }),
    [onCommit, onCreate, onOpenDay],
  );

  const linkTo = (date: Date, nextView: CalendarView = view) => ({
    to: "/spaces/$spaceId/calendar/$date" as const,
    params: { spaceId, date: urlDate(date) },
    search: { view: nextView, projectId },
  });

  const ProjectLink = useCallback(
    // eslint-disable-next-line react-x/no-nested-component-definitions
    ({
      children,
      projectId: linkProjectId,
      className,
      ref,
    }: {
      children?: React.ReactNode;
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }) => (
      <Link
        to="/spaces/$spaceId/calendar/$date"
        params={{ spaceId, date: urlDate(anchor) }}
        search={{ view, projectId: linkProjectId }}
        className={className}
        ref={ref}
      >
        {children}
      </Link>
    ),
    [spaceId, anchor, view],
  );

  const bodyRef = useRef<HTMLDivElement>(null);
  useExternalTaskDrop(bodyRef, onCommit);

  return (
    <div className="flex h-full w-full">
      <ProjectsSplit
        topClassName="flex min-h-0 flex-col"
        projectLink={ProjectLink}
        selectedProjectId={projectId === "inbox" ? inboxId : projectId}
        selectedDate={anchor}
      >
        <header className="flex h-14 shrink-0 items-center gap-4 px-4 pt-2">
          <div className="[app-region:no-drag] -mt-2">
            <NavBar spaceId={spaceId} />
          </div>
          <h1 className="truncate text-lg font-semibold text-content">
            {calendarTitle(view, anchor, new Date())}
          </h1>

          <div className="ml-auto flex items-center gap-3 [app-region:no-drag]">
            <div className="flex items-center">
              <Link
                {...linkTo(shiftAnchor(view, anchor, -1))}
                className={navButtonClass}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <Link {...linkTo(new Date())} className={navButtonClass}>
                Today
              </Link>
              <Link
                {...linkTo(shiftAnchor(view, anchor, 1))}
                className={navButtonClass}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex rounded-lg p-0.5 ring-1 ring-white/10">
              {calendarViews.map((v) => (
                <Link
                  key={v}
                  {...linkTo(anchor, v)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm transition-colors",
                    v === view
                      ? "bg-white/10 font-medium text-content"
                      : "text-content-tinted hover:text-content",
                  )}
                >
                  {viewLabels[v]}
                </Link>
              ))}
            </div>

            <TooltipProvider>
              <SyncIndicator />
            </TooltipProvider>
          </div>
        </header>

        <div
          ref={bodyRef}
          data-focus-region-direction="row"
          className="flex min-h-0 flex-1 flex-col px-4 pb-4"
        >
          {view === "month" || view === "plan" ? (
            <>
              <WeekdayHeader days={days.slice(0, 7)} />
              <div
                className="grid min-h-0 flex-1 grid-cols-7 border-l border-white/5"
                style={{
                  gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))`,
                }}
              >
                {days.map((day) => {
                  const events = eventsByDate.get(urlDate(day)) ?? [];
                  return view === "month" ? (
                    <MonthCell
                      key={day.getTime()}
                      day={day}
                      anchor={anchor}
                      today={today}
                      events={events}
                      actions={actions}
                    />
                  ) : (
                    <PlanCell
                      key={day.getTime()}
                      day={day}
                      today={today}
                      events={events}
                      actions={actions}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <TimeGridView
              days={days}
              today={today}
              eventsByDate={eventsByDate}
              actions={actions}
            />
          )}
        </div>
      </ProjectsSplit>

      <ItemDetails />
      <DragGhost />
    </div>
  );
};

// Follows the pointer while dragging over day cells; the time grid draws its
// own preview block instead.
const DragGhost = () => {
  const drag = useCalendarDrag((s) => s.drag);
  if (!drag || drag.isNative || drag.mode !== "move" || drag.target?.time) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[2000] max-w-56 truncate rounded-md border border-accent bg-panel px-2 py-1 text-xs text-content shadow-lg"
      style={{ left: drag.x + 12, top: drag.y + 8 }}
    >
      {drag.event.title}
    </div>
  );
};
