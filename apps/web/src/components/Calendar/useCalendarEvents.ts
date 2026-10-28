import { useMemo } from "react";
import { endOfDay, startOfDay } from "date-fns";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  dailyEntryType,
  datedEntriesByDates,
  getDMY,
  isDailyOrCoarser,
  taskTemplateType,
  taskTemplateUpcomingOccurrences,
} from "@will-be-done/slices/space";
import { buildFocusKey } from "@/store/focusSlice.ts";
import { type CalendarEvent, sortDayEvents } from "./calendarModel";

// Sorted events per "yyyy-MM-dd" date, including upcoming template
// occurrences.
export function useCalendarEvents(dates: Date[]): Map<string, CalendarEvent[]> {
  const dmys = useMemo(() => dates.map((date) => getDMY(date)), [dates]);

  const { data: rows = [] } = useAsyncSelector({
    selector: datedEntriesByDates,
    args: { dates: dmys },
    placeholderData: (previous) => previous ?? [],
  });
  const { data: occurrences = [] } = useAsyncSelector({
    selector: taskTemplateUpcomingOccurrences,
    args: {
      fromDate: startOfDay(dates[0]!).getTime(),
      toDate: endOfDay(dates[dates.length - 1]!).getTime(),
    },
    placeholderData: (previous) => previous ?? [],
  });

  return useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>(
      dmys.map((date) => [date, []]),
    );

    for (const { date, entry, task } of rows) {
      byDate.get(date)?.push({
        key: entry.id,
        taskId: task.id,
        focusKey: buildFocusKey(entry.id, dailyEntryType),
        date,
        title: task.title,
        nature: task.nature,
        time: entry.time ?? null,
        durationMinutes: task.durationMinutes ?? null,
        isDone: task.state === "done",
        isProjected: false,
        templateId: null,
      });
    }

    for (const occurrence of occurrences) {
      const { template } = occurrence;
      byDate.get(occurrence.date)?.push({
        key: `projected-${occurrence.id}`,
        taskId: occurrence.id,
        // A template can occur several times in view; keys must be unique.
        focusKey: buildFocusKey(template.id, taskTemplateType, occurrence.date),
        date: occurrence.date,
        title: template.title,
        nature: template.nature,
        time: occurrence.time,
        durationMinutes: template.durationMinutes ?? null,
        isDone: false,
        isProjected: true,
        templateId: isDailyOrCoarser(template.repeatRule) ? template.id : null,
      });
    }

    for (const [date, events] of byDate) {
      byDate.set(date, sortDayEvents(events));
    }
    return byDate;
  }, [dmys, rows, occurrences]);
}
