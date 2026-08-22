import { cn } from "@/lib/utils.ts";
import {
  DEFAULT_DAY_END_MINUTES,
  type WorkBreak,
} from "@will-be-done/slices/space";
import {
  heightForDuration,
  START_HOUR,
  END_HOUR,
  topForMinutes,
} from "./timeGrid.ts";

function clipToGrid(
  startMinutes: number,
  endMinutes: number,
  hourHeight?: number,
) {
  const start = Math.max(startMinutes, START_HOUR * 60);
  const end = Math.min(endMinutes, END_HOUR * 60);
  if (end <= start) return null;
  return {
    top: topForMinutes(start, hourHeight),
    height: heightForDuration(end - start, hourHeight),
  };
}

export function WorkdayLayer({
  dayStartMinutes,
  dayEndMinutes,
  breaks,
  boundClassName,
  breakClassName,
  hourHeight,
}: {
  dayStartMinutes: number;
  dayEndMinutes?: number;
  breaks?: WorkBreak[];
  boundClassName: string;
  breakClassName: string;
  hourHeight?: number;
}) {
  const endMinutes = dayEndMinutes ?? DEFAULT_DAY_END_MINUTES;
  const startLayout = clipToGrid(dayStartMinutes, dayStartMinutes + 1, hourHeight);
  const endLayout = clipToGrid(endMinutes, endMinutes + 1, hourHeight);

  return (
    <>
      {(breaks ?? []).map((item) => {
        const layout = clipToGrid(
          item.startMinutes,
          item.endMinutes,
          hourHeight,
        );
        if (!layout) return null;
        return (
          <div
            key={item.id}
            className={breakClassName}
            style={{ top: layout.top, height: layout.height }}
          />
        );
      })}
      {startLayout && (
        <div
          className={boundClassName}
          style={{ top: startLayout.top }}
          aria-hidden="true"
        />
      )}
      {endLayout && (
        <div
          className={cn(boundClassName, `${boundClassName}--end`)}
          style={{ top: endLayout.top }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
