import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock, Hourglass, X } from "lucide-react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  dailyEntryByTaskId,
  getDMY,
  removeFromDailyList,
  scheduleTask,
  setDailyEntryTime,
  taskById,
  updateTask,
} from "@will-be-done/slices/space";
import { differenceInCalendarDays } from "date-fns";
import { captureWebAnalytics } from "@/lib/analytics";
import { DurationInput, TimeInput } from "./TaskTimeInputs";

interface TaskDatePickerProps {
  taskId: string;
  currentDate: Date | undefined;
  trigger?: React.ReactNode;
  anchor?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function TaskDatePicker({
  taskId,
  currentDate,
  trigger,
  anchor,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: TaskDatePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setIsOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      {anchor && <PopoverAnchor asChild>{anchor}</PopoverAnchor>}
      <PopoverContent
        className="z-[1100] w-auto p-0"
        align="end"
        onDoubleClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <TaskDatePickerContent
          taskId={taskId}
          currentDate={currentDate}
          isOpen={isOpen}
          onDone={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// Mounted only while the popover is open, so its selectors don't run for every
// task row.
function TaskDatePickerContent({
  taskId,
  currentDate,
  isOpen,
  onDone,
}: {
  taskId: string;
  currentDate: Date | undefined;
  isOpen: boolean;
  onDone: () => void;
}) {
  const dispatch = useAsyncDispatch();
  const { data: task } = useAsyncSelector({
    selector: taskById,
    args: { id: taskId },
  });
  const { data: dailyEntry } = useAsyncSelector({
    selector: dailyEntryByTaskId,
    args: { taskId },
  });

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    void (async () => {
      await dispatch(
        scheduleTask({
          taskId,
          date: getDMY(date),
          position: "append",
        }),
      );
      const daysAhead = differenceInCalendarDays(date, new Date());
      if (currentDate) {
        captureWebAnalytics({
          name: "task_rescheduled",
          properties: {
            days_ahead: daysAhead,
            previous_days_ahead: differenceInCalendarDays(
              currentDate,
              new Date(),
            ),
            scheduling_method: "date_picker",
          },
        });
      } else {
        captureWebAnalytics({
          name: "task_scheduled",
          properties: {
            days_ahead: daysAhead,
            scheduling_method: "date_picker",
          },
        });
      }
    })();
  };

  const handleClearDate = () => {
    if (!currentDate) return;

    void (async () => {
      await dispatch(removeFromDailyList({ taskId: taskId }));
      captureWebAnalytics({
        name: "task_unscheduled",
        properties: {
          previous_days_ahead: differenceInCalendarDays(
            currentDate,
            new Date(),
          ),
          unscheduling_method: "date_picker",
        },
      });
      onDone();
    })();
  };

  return (
    <div className="flex flex-col">
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={handleDateSelect}
        modifiers={{
          today: new Date(),
        }}
      />
      <div className="flex flex-col gap-1.5 border-t border-ring px-3 py-2 text-xs text-content-tinted">
        {/* Time lives on the DailyEntry, so it needs a date first. */}
        {currentDate && dailyEntry && (
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              Time
            </span>
            <TimeInput
              time={dailyEntry.time ?? null}
              onChange={(time) =>
                void dispatch(setDailyEntryTime({ taskId, time }))
              }
            />
          </label>
        )}
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <Hourglass className="h-3 w-3 shrink-0" />
            Duration
          </span>
          <DurationInput
            durationMinutes={task?.durationMinutes ?? null}
            onChange={(durationMinutes) =>
              void dispatch(
                updateTask({ id: taskId, task: { durationMinutes } }),
              )
            }
          />
        </label>
      </div>
      {currentDate && isOpen && (
        <div className="p-3 border-t border-ring">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearDate}
            className="w-full flex items-center justify-center gap-2 text-content bg-transparent border-ring hover:bg-panel-hover hover:text-primary"
          >
            <X className="h-4 w-4" />
            Clear Date
          </Button>
        </div>
      )}
    </div>
  );
}
