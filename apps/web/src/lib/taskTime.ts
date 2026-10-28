import { isValidTaskDuration } from "@will-be-done/slices/space";

const pad = (n: number) => String(n).padStart(2, "0");

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

// Task times are stored as floating "HH:mm" strings; display them in the
// user's locale. Formatting in UTC keeps local DST gaps from shifting the hour.
export function formatTaskTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return timeFormat.format(Date.UTC(1970, 0, 1, hours, minutes));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// Parses typed times: "930", "0930", "14:30", "9.30", "9", "2pm", "2:30 pm",
// "12am". Returns "HH:mm", or null when the text is not a valid time.
export function parseTaskTime(input: string): string | null {
  const match =
    /^(\d{1,2})(?:[:.]?(\d{2}))?\s*([ap])\.?(?:m\.?)?$|^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(
      input.trim().toLowerCase(),
    );
  if (!match) return null;

  const meridiem = match[3];
  let hours = Number(match[1] ?? match[4]);
  const minutes = Number(match[2] ?? match[5] ?? 0);
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return `${pad(hours)}:${pad(minutes)}`;
}

const hoursMinutesPattern =
  /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?)?)?$/;

// Parses typed durations: "90" (minutes), "45m", "2h", "1.5h", "1h 30m",
// "1h30", "1:30". Returns null when the text is not a valid duration.
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(",", ".");
  let minutes: number | null = null;

  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  const hoursMinutes = hoursMinutesPattern.exec(text);
  if (/^\d+$/.test(text)) {
    minutes = Number(text);
  } else if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (hoursMinutes && (hoursMinutes[1] || hoursMinutes[2])) {
    minutes =
      Math.round(Number(hoursMinutes[1] ?? 0) * 60) +
      Number(hoursMinutes[2] ?? 0);
  }

  return minutes !== null && isValidTaskDuration(minutes) ? minutes : null;
}

export const durationPresets = [15, 30, 45, 60, 90, 120, 180, 240, 480];
