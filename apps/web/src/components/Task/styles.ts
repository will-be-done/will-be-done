import { cn } from "@/lib/utils";

export const taskFloatingControlSurface =
  "rounded-sm bg-panel/90 text-content-tinted ";

export const taskFloatingControlDoneSurface =
  "bg-done-panel-tinted/95 text-done-content ";

export const taskFloatingControlHover =
  "hover:bg-panel-hover hover:text-content";

export const taskFloatingControlVisible =
  "group-hover/task:opacity-100 group-focus-within/task:opacity-100";

export const taskFloatingControlButtonClassName = ({
  isVisible,
  isDone,
}: {
  isVisible: boolean;
  isDone: boolean;
}) =>
  cn(
    taskFloatingControlSurface,
    isDone ? taskFloatingControlDoneSurface : taskFloatingControlHover,
    isDone && "hover:bg-done-panel-selected/30 hover:text-done-content",
    "size-5 cursor-pointer opacity-0 transition-opacity focus-visible:opacity-100",
    isVisible && "opacity-100",
    taskFloatingControlVisible,
  );

export const taskFloatingIconGroupClassName = ({
  isShifted,
  isDone,
}: {
  isShifted: boolean;
  isDone: boolean;
}) =>
  cn(
    taskFloatingControlSurface,
    isDone && taskFloatingControlDoneSurface,
    "absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center gap-0.5 px-1 transition-transform",
    isShifted && "-translate-x-6",
    "group-hover/task:-translate-x-6 group-focus-within/task:-translate-x-6",
  );
