import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  minutesToTimeInput,
  timeInputToMinutes,
  type WorkBreak,
} from "@will-be-done/slices/space";

const timeInputClassName =
  "h-9 cursor-pointer rounded-lg bg-panel px-3 text-[13px] text-content ring-1 ring-border";

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
            <input
              type="time"
              step={900}
              aria-label="Day starts at"
              value={minutesToTimeInput(dayStartMinutes)}
              onChange={(event) =>
                onChange({
                  dayStartMinutes: timeInputToMinutes(event.target.value),
                })
              }
              className={timeInputClassName}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-content-tinted">
              Ends
            </span>
            <input
              type="time"
              step={900}
              aria-label="Day ends at"
              value={minutesToTimeInput(dayEndMinutes)}
              onChange={(event) =>
                onChange({
                  dayEndMinutes: timeInputToMinutes(event.target.value),
                })
              }
              className={timeInputClassName}
            />
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
                  <input
                    type="time"
                    step={900}
                    aria-label="Break starts at"
                    value={minutesToTimeInput(item.startMinutes)}
                    onChange={(event) =>
                      onChange({
                        breaks: breaks.map((current) =>
                          current.id === item.id
                            ? {
                                ...current,
                                startMinutes: timeInputToMinutes(
                                  event.target.value,
                                ),
                              }
                            : current,
                        ),
                      })
                    }
                    className={cn(timeInputClassName, "min-w-0 flex-1")}
                  />
                  <span className="text-[12px] text-content-tinted">to</span>
                  <input
                    type="time"
                    step={900}
                    aria-label="Break ends at"
                    value={minutesToTimeInput(item.endMinutes)}
                    onChange={(event) =>
                      onChange({
                        breaks: breaks.map((current) =>
                          current.id === item.id
                            ? {
                                ...current,
                                endMinutes: timeInputToMinutes(
                                  event.target.value,
                                ),
                              }
                            : current,
                        ),
                      })
                    }
                    className={cn(timeInputClassName, "min-w-0 flex-1")}
                  />
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
