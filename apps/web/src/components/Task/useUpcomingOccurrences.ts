import { useMemo } from "react";
import { endOfDay, startOfDay } from "date-fns";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  type TaskTemplateOccurrence,
  taskTemplateUpcomingOccurrences,
} from "@will-be-done/slices/space";

const noOccurrences: TaskTemplateOccurrence[] = [];

// Template occurrences that are not generated yet, grouped by "yyyy-MM-dd"
// date. Timed occurrences come first, by time.
export function useUpcomingOccurrences(
  dates: Date[],
): (date: string) => TaskTemplateOccurrence[] {
  const { data: occurrences = noOccurrences } = useAsyncSelector({
    selector: taskTemplateUpcomingOccurrences,
    args: {
      fromDate: startOfDay(dates[0]!).getTime(),
      toDate: endOfDay(dates[dates.length - 1]!).getTime(),
    },
    placeholderData: (previous) => previous ?? noOccurrences,
  });

  const byDate = useMemo(() => {
    const result = new Map<string, TaskTemplateOccurrence[]>();
    const sorted = [...occurrences].sort(
      (a, b) =>
        Number(a.time === null) - Number(b.time === null) ||
        (a.time ?? "").localeCompare(b.time ?? ""),
    );
    for (const occurrence of sorted) {
      const list = result.get(occurrence.date) ?? [];
      list.push(occurrence);
      result.set(occurrence.date, list);
    }
    return result;
  }, [occurrences]);

  return (date) => byDate.get(date) ?? noOccurrences;
}
