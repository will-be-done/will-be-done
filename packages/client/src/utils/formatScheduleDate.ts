import { format } from "date-fns";

export const formatScheduleDate = (date: Date | undefined, now = new Date()) =>
  date
    ? format(
        date,
        date.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy",
      )
    : "No date";
