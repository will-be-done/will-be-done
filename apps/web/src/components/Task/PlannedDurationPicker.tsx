import { useState } from "react";
import { Clock, Timer } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  TimePicker,
  formatClockMinutes,
} from "@/components/TimePicker/TimePicker.tsx";
import { cn } from "@/lib/utils.ts";

export const PLANNED_DURATION_MINUTES = [
  30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480,
] as const;

export function formatPlannedClock(minutes: number | null | undefined): string {
  if (minutes == null) return "--:--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

export function formatPlannedDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hourLabel = `${hours} hr`;
  if (mins === 0) return hourLabel;
  return `${hourLabel} ${mins} min`;
}

export function TaskStartTimeField({
  startsAt,
  day,
  onChange,
}: {
  startsAt: number | undefined;
  day: Date;
  onChange: (startsAt: number | null) => void;
}) {
  const minutesFromMidnight =
    startsAt == null
      ? null
      : new Date(startsAt).getHours() * 60 + new Date(startsAt).getMinutes();

  return (
    <TimePicker
      value={minutesFromMidnight}
      onChange={(nextMinutes) => {
        const next = new Date(day);
        next.setHours(Math.floor(nextMinutes / 60), nextMinutes % 60, 0, 0);
        onChange(next.getTime());
      }}
    >
      <button
        type="button"
        aria-label="Start time"
        className={cn(
          "flex h-4 cursor-pointer items-center gap-0.5 rounded-sm leading-none",
          "hover:bg-black/5 dark:hover:bg-white/5",
          startsAt == null && "text-content-tinted",
        )}
      >
        <Clock className="size-3 shrink-0" />
        <span className="tabular-nums">
          {minutesFromMidnight == null
            ? "--:--"
            : formatClockMinutes(minutesFromMidnight)}
        </span>
      </button>
    </TimePicker>
  );
}

export function PlannedDurationPicker({
  value,
  onChange,
  nested = false,
  showIcon = true,
  compact,
  align = "end",
  className,
}: {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  nested?: boolean;
  showIcon?: boolean;
  compact?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isCompact = compact ?? !showIcon;
  const options =
    value != null &&
    !(PLANNED_DURATION_MINUTES as readonly number[]).includes(value)
      ? [value, ...PLANNED_DURATION_MINUTES]
      : [...PLANNED_DURATION_MINUTES];

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-md cursor-pointer",
            isCompact
              ? "h-4 gap-0.5 px-0 py-0 text-xs leading-none"
              : "gap-1.5 px-2 py-1.5 text-sm",
            value != null
              ? isCompact
                ? "hover:bg-black/5 dark:hover:bg-white/5"
                : "text-content hover:bg-panel-hover"
              : "text-content-tinted hover:bg-panel-hover hover:text-content",
            className,
          )}
          aria-label="Planned duration"
        >
          {showIcon && <Timer className={isCompact ? "size-3" : "size-4"} />}
          <span>{formatPlannedClock(value)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-add-task-nested={nested ? true : undefined}
        align={align}
        className="z-[1100] w-40 p-0"
      >
        <div className="px-3 py-2.5">
          <div className="text-xs text-content-tinted">Planned:</div>
          <div className="text-sm text-content-tinted">
            {formatPlannedClock(value)}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto border-t border-ring py-1">
          {options.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={cn(
                "flex w-full cursor-pointer px-3 py-2 text-left text-sm text-content hover:bg-panel-hover",
                value === minutes && "bg-panel-hover",
              )}
              onClick={() => {
                onChange(minutes);
                setOpen(false);
              }}
            >
              {formatPlannedDuration(minutes)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
