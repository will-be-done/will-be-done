import { useRef, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
  Calendar,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  FolderOpen,
  ListPlus,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { taskFloatingControlButtonClassName } from "./styles";

const focusableMenuItemSelector = [
  "[data-slot='dropdown-menu-item']",
  "[data-slot='dropdown-menu-checkbox-item']",
  "[data-slot='dropdown-menu-radio-item']",
  "[data-slot='dropdown-menu-sub-trigger']",
]
  .map(
    (selector) =>
      `${selector}:not([data-disabled]):not([aria-disabled='true'])`,
  )
  .join(",");

const isMenuNavigationKey = (event: KeyboardEvent) =>
  !(event.ctrlKey || event.metaKey || event.altKey) &&
  (event.code === "ArrowUp" ||
    event.code === "ArrowDown" ||
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight" ||
    event.code === "Home" ||
    event.code === "End" ||
    event.code === "PageUp" ||
    event.code === "PageDown" ||
    event.code === "Tab" ||
    event.code === "Enter" ||
    event.code === "Space" ||
    event.code === "Escape");

const focusAdjacentMenuItem = (
  content: HTMLElement,
  direction: "next" | "previous",
) => {
  const items = Array.from(
    content.querySelectorAll<HTMLElement>(focusableMenuItemSelector),
  );

  if (!items.length) return;

  const activeIndex = items.findIndex((item) => item === document.activeElement);
  const fallbackIndex = direction === "next" ? 0 : items.length - 1;
  const nextIndex =
    activeIndex === -1
      ? fallbackIndex
      : direction === "next"
        ? (activeIndex + 1) % items.length
        : (activeIndex - 1 + items.length) % items.length;

  items[nextIndex]?.focus();
};

export const TaskDropdownMenu = ({
  isFocused,
  isOpen,
  isDone,
  canMarkDone,
  canScheduleTask,
  canResetSchedule,
  canStashTask,
  canAddChecklistItem,
  onOpenChange,
  onMarkDone,
  onMoveToProject,
  onStashTask,
  onChangeDate,
  onScheduleToday,
  onResetSchedule,
  onAddTaskAfter,
  onAddTaskBefore,
  onAddChecklistItem,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onDelete,
  onShortcutKeyDown,
  onCloseAutoFocus,
}: {
  isFocused: boolean;
  isOpen: boolean;
  isDone: boolean;
  canMarkDone: boolean;
  canScheduleTask: boolean;
  canResetSchedule: boolean;
  canStashTask: boolean;
  canAddChecklistItem: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkDone: () => void;
  onMoveToProject: () => void;
  onStashTask: () => void;
  onChangeDate: () => void;
  onScheduleToday: () => void;
  onResetSchedule: () => void;
  onAddTaskAfter: () => void;
  onAddTaskBefore: () => void;
  onAddChecklistItem: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
  onShortcutKeyDown?: (event: KeyboardEvent) => boolean | void;
  onCloseAutoFocus?: (event: Event) => void;
}) => {
  const shouldSkipNextCloseAutoFocusRef = useRef(false);

  const handleShortcutKeyDown = (event: KeyboardEvent) => {
    if (
      !(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) &&
      (event.code === "KeyJ" || event.code === "KeyK")
    ) {
      event.preventDefault();
      event.stopPropagation();
      focusAdjacentMenuItem(
        event.currentTarget as HTMLElement,
        event.code === "KeyJ" ? "next" : "previous",
      );
      return;
    }

    if (isMenuNavigationKey(event)) {
      return;
    }

    shouldSkipNextCloseAutoFocusRef.current =
      onShortcutKeyDown?.(event) ?? false;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Task actions"
          className={taskFloatingControlButtonClassName({
            isVisible: isFocused || isOpen,
            isDone,
          })}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-52 bg-task-dropdown shadow-2xl ring-0 backdrop-blur-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={handleShortcutKeyDown}
        onKeyDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (shouldSkipNextCloseAutoFocusRef.current) {
            shouldSkipNextCloseAutoFocusRef.current = false;
            return;
          }

          onCloseAutoFocus?.(e);
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onMarkDone} disabled={!canMarkDone}>
            <CircleCheck />
            {isDone ? "Mark as todo" : "Mark as done"}
            <DropdownMenuShortcut>Space</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              shouldSkipNextCloseAutoFocusRef.current = true;
              onMoveToProject();
            }}
          >
            <FolderOpen />
            Move to project
            <DropdownMenuShortcut>m</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              shouldSkipNextCloseAutoFocusRef.current = true;
              onStashTask();
            }}
            disabled={!canStashTask}
          >
            <Archive />
            Stash task
            <DropdownMenuShortcut>S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              shouldSkipNextCloseAutoFocusRef.current = true;
              onOpenChange(false);
              window.setTimeout(onChangeDate, 0);
            }}
            disabled={!canScheduleTask}
          >
            <Calendar />
            Schedule Date
            <DropdownMenuShortcut>s</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onScheduleToday}
            disabled={!canScheduleTask}
          >
            <CalendarCheck />
            Schedule today
            <DropdownMenuShortcut>t</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onResetSchedule}
            disabled={!canResetSchedule}
          >
            <CalendarX />
            Reset schedule
            <DropdownMenuShortcut>r</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              shouldSkipNextCloseAutoFocusRef.current = true;
              onAddChecklistItem();
            }}
            disabled={!canAddChecklistItem}
          >
            <ListPlus />
            Add checklist item
            <DropdownMenuShortcut>c</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              shouldSkipNextCloseAutoFocusRef.current = true;
              onAddTaskAfter();
            }}
            disabled={isDone}
          >
            <Plus />
            Add task after
            <DropdownMenuShortcut>o</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              shouldSkipNextCloseAutoFocusRef.current = true;
              onAddTaskBefore();
            }}
            disabled={isDone}
          >
            <Plus />
            Add task before
            <DropdownMenuShortcut>O</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onMoveUp}>
            <ArrowUp />
            Move up
            <DropdownMenuShortcut>^k</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveDown}>
            <ArrowDown />
            Move down
            <DropdownMenuShortcut>^j</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveLeft}>
            <ArrowLeft />
            Move left
            <DropdownMenuShortcut>^h</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveRight}>
            <ArrowRight />
            Move right
            <DropdownMenuShortcut>^l</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
          <DropdownMenuShortcut>d</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
