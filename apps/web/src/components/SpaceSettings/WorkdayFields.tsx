import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WorkBreak } from "@will-be-done/slices/space";
import {
  TimePicker,
  formatClockMinutes,
} from "@/components/TimePicker/TimePicker.tsx";

const timeInputClassName =
  "h-9 w-full cursor-pointer rounded-lg bg-panel px-3 text-left text-[13px] tabular-nums text-content ring-1 ring-border";

export type WorkdayValue = {
  dayStartMinutes: number;
  dayEndMinutes: number;
  breaks: WorkBreak[];
};

export function WorkdayFields({
  dayStartMinutes,
  dayEndMinutes,
  breaks,
  onChange,
  showHours = true,
  showBreaks = true,
  className,
}: WorkdayValue & {
  onChange: (next: Partial<WorkdayValue>) => void;
  showHours?: boolean;
  showBreaks?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {showHours && (
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-content-tinted">
              Starts
            </span>
            <TimePicker
              inline
              value={dayStartMinutes}
              onChange={(dayStartMinutes) => onChange({ dayStartMinutes })}
            >
              <button
                type="button"
                aria-label="Day starts at"
                className={timeInputClassName}
              >
                {formatClockMinutes(dayStartMinutes)}
              </button>
            </TimePicker>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-content-tinted">
              Ends
            </span>
            <TimePicker
              inline
              value={dayEndMinutes}
              onChange={(dayEndMinutes) => onChange({ dayEndMinutes })}
            >
              <button
                type="button"
                aria-label="Day ends at"
                className={timeInputClassName}
              >
                {formatClockMinutes(dayEndMinutes)}
              </button>
            </TimePicker>
          </label>
        </div>
      )}

      {showBreaks && (
        <>
          <div
            className={cn(
              "flex items-center justify-between gap-2",
              showHours && "mt-3",
            )}
          >
            <span className="text-[11px] font-medium text-content-tinted">
              Breaks
            </span>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] text-content-tinted hover:bg-overlay hover:text-content"
              onClick={() => {
                const start = Math.min(
                  dayStartMinutes + 4 * 60,
                  Math.max(dayStartMinutes, dayEndMinutes - 60),
                );
                onChange({
                  breaks: [
                    ...breaks,
                    {
                      id: crypto.randomUUID(),
                      startMinutes: start,
                      endMinutes: Math.min(start + 30, dayEndMinutes),
                    },
                  ],
                });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add break
            </button>
          </div>

          {breaks.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {breaks.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <TimePicker
                    inline
                    value={item.startMinutes}
                    onChange={(startMinutes) =>
                      onChange({
                        breaks: breaks.map((current) =>
                          current.id === item.id
                            ? { ...current, startMinutes }
                            : current,
                        ),
                      })
                    }
                  >
                    <button
                      type="button"
                      aria-label="Break starts at"
                      className={cn(timeInputClassName, "min-w-0 flex-1")}
                    >
                      {formatClockMinutes(item.startMinutes)}
                    </button>
                  </TimePicker>
                  <span className="text-[12px] text-content-tinted">to</span>
                  <TimePicker
                    inline
                    value={item.endMinutes}
                    onChange={(endMinutes) =>
                      onChange({
                        breaks: breaks.map((current) =>
                          current.id === item.id
                            ? { ...current, endMinutes }
                            : current,
                        ),
                      })
                    }
                  >
                    <button
                      type="button"
                      aria-label="Break ends at"
                      className={cn(timeInputClassName, "min-w-0 flex-1")}
                    >
                      {formatClockMinutes(item.endMinutes)}
                    </button>
                  </TimePicker>
                  <button
                    type="button"
                    aria-label="Remove break"
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-content-tinted hover:bg-overlay hover:text-content"
                    onClick={() =>
                      onChange({
                        breaks: breaks.filter(
                          (current) => current.id !== item.id,
                        ),
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
