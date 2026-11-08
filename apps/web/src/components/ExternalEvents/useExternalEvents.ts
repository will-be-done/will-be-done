import { useMemo } from "react";
import { addDays, startOfDay } from "date-fns";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  externalEventOccurrencesInRange,
  parseDMY,
} from "@will-be-done/slices/space";
import {
  type DayExternalEvent,
  externalEventsByDay,
} from "./externalEventsModel";

export const externalEventsRange = (dates: Date[]) => ({
  fromMs: startOfDay(dates[0]!).getTime(),
  toMs: startOfDay(addDays(dates[dates.length - 1]!, 1)).getTime(),
});

// External events per local "yyyy-MM-dd" for consecutive `dates`.
export function useExternalEvents(
  dates: Date[],
): Map<string, DayExternalEvent[]> {
  const { data: occurrences = [] } = useAsyncSelector({
    selector: externalEventOccurrencesInRange,
    args: externalEventsRange(dates),
    placeholderData: (previous) => previous ?? [],
  });
  return useMemo(
    () => externalEventsByDay(occurrences, dates),
    [occurrences, dates],
  );
}

export function useDayExternalEvents(date: string): DayExternalEvent[] {
  const days = useMemo(() => [parseDMY(date)], [date]);
  return useExternalEvents(days).get(date) ?? [];
}
