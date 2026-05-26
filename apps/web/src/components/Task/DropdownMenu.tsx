import { useRef, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
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

export const TaskDropdownMenu = ({
  isFocused,
  isOpen,
  isDone,
  canMarkDone,
  canAddChecklistItem,
  onOpenChange,
  onMarkDone,
  onMoveToProject,
  onChangeDate,
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
  canAddChecklistItem: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkDone: () => void;
  onMoveToProject: () => void;
  onChangeDate: () => void;
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
            onSelect={(event) => {
              event.preventDefault();
              shouldSkipNextCloseAutoFocusRef.current = true;
              onOpenChange(false);
              window.setTimeout(onChangeDate, 0);
            }}
            disabled={!canMarkDone}
          >
            <Calendar />
            Change date
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
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
