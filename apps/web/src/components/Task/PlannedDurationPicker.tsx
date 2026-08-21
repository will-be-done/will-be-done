import { useState } from "react";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

export const PLANNED_DURATION_MINUTES = [
  5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
  360, 390, 420, 450, 480,
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

export function PlannedDurationPicker({
  value,
  onChange,
  nested = false,
  showIcon = true,
  align = "end",
  className,
}: {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  nested?: boolean;
  showIcon?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-md cursor-pointer",
            showIcon ? "px-2 py-1.5 text-sm" : "px-1.5 py-0.5 text-xs",
            value != null
              ? showIcon
                ? "text-content hover:bg-panel-hover"
                : "hover:bg-black/5 dark:hover:bg-white/5"
              : "text-content-tinted hover:bg-panel-hover hover:text-content",
            className,
          )}
          aria-label="Planned duration"
        >
          {showIcon && <Clock className="size-4" />}
          <span>{formatPlannedClock(value)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-add-task-nested={nested ? true : undefined}
        align={align}
        className="z-70 w-40 p-0"
      >
        <div className="px-3 py-2.5">
          <div className="text-xs text-content-tinted">Planned:</div>
          <div className="text-sm text-content-tinted">
            {formatPlannedClock(value)}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto border-t border-ring py-1">
          {PLANNED_DURATION_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="flex w-full cursor-pointer px-3 py-2 text-left text-sm text-content hover:bg-panel-hover"
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
