import { AnyModelType } from "@will-be-done/slices/space";

export type DndModelData = {
  modelId: string;
  modelType: AnyModelType;
  timelineGrabOffsetMinutes?: number;
  timelineDurationMinutes?: number;
  timelineTitle?: string;
  timelineDone?: boolean;
};

export const dayTimelineDropKind = "dayTimeline";

export const dayTimelineDropData = {
  kind: dayTimelineDropKind,
} as const;

export type DayTimelineDropData = typeof dayTimelineDropData;

export function isModelDNDData(data: unknown): data is DndModelData {
  return typeof data == "object" && data !== null && "modelId" in data;
}

export function isDayTimelineDropData(
  data: unknown,
): data is DayTimelineDropData {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === dayTimelineDropKind
  );
}
