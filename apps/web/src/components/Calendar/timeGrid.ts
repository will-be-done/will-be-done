export const START_HOUR = 0;
export const END_HOUR = 24;
export const HOURS = END_HOUR - START_HOUR;
export const HOUR_HEIGHT = 80;
export const SNAP_MINUTES = 5;
export const DEFAULT_DURATION_MINUTES = 30;

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function rawMinutesAtClientY(
  clientY: number,
  columnTop: number,
  hourHeight = HOUR_HEIGHT,
): number {
  const minutesFromGridStart = ((clientY - columnTop) / hourHeight) * 60;
  return START_HOUR * 60 + minutesFromGridStart;
}

export function clampStartMinutes(
  minutes: number,
  durationMinutes = SNAP_MINUTES,
): number {
  const maxStart = END_HOUR * 60 - Math.max(SNAP_MINUTES, durationMinutes);
  return Math.min(Math.max(START_HOUR * 60, minutes), maxStart);
}

export function startMinutesFromPointer({
  clientY,
  columnTop,
  grabOffsetMinutes = 0,
  durationMinutes = SNAP_MINUTES,
  hourHeight = HOUR_HEIGHT,
}: {
  clientY: number;
  columnTop: number;
  grabOffsetMinutes?: number;
  durationMinutes?: number;
  hourHeight?: number;
}): number {
  return snapMinutes(
    clampStartMinutes(
      rawMinutesAtClientY(clientY, columnTop, hourHeight) - grabOffsetMinutes,
      durationMinutes,
    ),
  );
}

export function minutesAtClientY(clientY: number, columnTop: number): number {
  return startMinutesFromPointer({ clientY, columnTop });
}

export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function topForMinutes(
  minutesOfDay: number,
  hourHeight = HOUR_HEIGHT,
): number {
  return ((minutesOfDay - START_HOUR * 60) / 60) * hourHeight;
}

export function heightForDuration(
  durationMinutes: number,
  hourHeight = HOUR_HEIGHT,
): number {
  return (Math.max(SNAP_MINUTES, durationMinutes) / 60) * hourHeight;
}

export function formatMinutesOfDay(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function grabOffsetMinutes(
  clientY: number,
  elementTop: number,
  hourHeight = HOUR_HEIGHT,
): number {
  return ((clientY - elementTop) / hourHeight) * 60;
}

export function scrollTopToCenterMinutes(
  minutesOfDay: number,
  viewportHeight: number,
  hourHeight = HOUR_HEIGHT,
): number {
  const top = topForMinutes(minutesOfDay, hourHeight);
  const maxScroll = Math.max(0, HOURS * hourHeight - viewportHeight);
  return Math.min(maxScroll, Math.max(0, top - viewportHeight / 2));
}
