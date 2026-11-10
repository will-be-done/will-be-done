import { addDays } from "date-fns";
import { type RenderedDays } from "./useInfiniteDays.ts";

export const OVERSCAN_DAYS = 10;
// Data is queried for whole chunks of days around the rendered ones, so
// scrolling only changes the queries when it crosses a chunk boundary.
export const DATA_CHUNK_DAYS = 7;

// The dates queried for the rendered days. The route loader preloads the same
// dates, so the selectors it warms are the ones the timeline reads.
export const dataWindowDates = (
  startDate: Date,
  rendered: Pick<RenderedDays, "from" | "to">,
) => {
  const chunkStart = Math.floor(rendered.from / DATA_CHUNK_DAYS);
  const chunkEnd = Math.ceil((rendered.to + 1) / DATA_CHUNK_DAYS);
  return Array.from(
    { length: (chunkEnd - chunkStart) * DATA_CHUNK_DAYS },
    (_, i) => addDays(startDate, chunkStart * DATA_CHUNK_DAYS + i),
  );
};
