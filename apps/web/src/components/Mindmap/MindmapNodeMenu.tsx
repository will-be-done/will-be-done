import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  FileText,
  ListChecks,
  FolderOpen,
  ListTodo,
  MoreHorizontal,
  Plus,
  SquareCheck,
  StickyNote,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MindmapTreeNode } from "@will-be-done/slices/space";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";

// The node's actions, as the "…" menu of a task in a list. Items mirror the
// canvas keys; a few that keys cannot reach (delete, convert) live only here.
export function MindmapNodeMenu({
  id,
  tree,
  actions,
  isScheduled,
  isRoot,
  open,
  onOpenChange,
  onCloseAutoFocus,
  triggerClassName,
}: {
  id: string;
  tree: MindmapTreeNode;
  actions: MindmapNodeActions;
  isScheduled: boolean;
  // A floating root: a topic placed by dragging, with main branches.
  isRoot: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  triggerClassName: string;
}) {
  const { task, note } = tree;
  const item = task ?? note;
  const label = task ? "task" : note ? "note" : "topic";
  const isDone = task?.state === "done";
  const isMobile = useIsMobile();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          title="Actions (a)"
          aria-label="Node actions"
          className={triggerClassName}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      {open && (
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          // The mobile toolbar opens it for a node that may be off-screen, and
          // covers the bottom of the screen.
          sticky="always"
          collisionPadding={
            isMobile ? { top: 8, right: 8, bottom: 80, left: 8 } : 8
          }
          className="min-w-52 bg-task-dropdown shadow-2xl ring-0 backdrop-blur-none"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {item && (
            <>
              <DropdownMenuGroup>
                {task && (
                  <DropdownMenuItem onSelect={() => actions.toggleTask(id)}>
                    <CircleCheck />
                    {isDone ? "Mark as todo" : "Mark as done"}
                    <DropdownMenuShortcut>Space</DropdownMenuShortcut>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => actions.moveToProject(id)}>
                  <FolderOpen />
                  Move to project
                  <DropdownMenuShortcut>m</DropdownMenuShortcut>
                </DropdownMenuItem>
                {task && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => actions.stash(id)}
                      disabled={isDone}
                    >
                      <Archive />
                      Stash task
                      <DropdownMenuShortcut>S</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.schedule(id)}>
                      <Calendar />
                      Schedule date
                      <DropdownMenuShortcut>s</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => actions.scheduleToday(id)}
                    >
                      <CalendarCheck />
                      Schedule today
                      <DropdownMenuShortcut>t</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => actions.resetSchedule(id)}
                      disabled={!isScheduled}
                    >
                      <CalendarX />
                      Reset schedule
                      <DropdownMenuShortcut>r</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </>
                )}
                {task && (
                  <DropdownMenuItem
                    onSelect={() => actions.addChecklistItem(id)}
                  >
                    <ListChecks />
                    Add checklist item
                    <DropdownMenuShortcut>c</DropdownMenuShortcut>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => actions.editDescription(id)}>
                  <FileText />
                  Edit description
                  <DropdownMenuShortcut>e</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.convert(id, task ? "note" : "task")}
                >
                  {task ? <StickyNote /> : <SquareCheck />}
                  {task ? "Convert to note" : "Convert to task"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.convert(id, "topic")}>
                  <Unlink />
                  Unlink, keep as topic
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            {!item && !isRoot && (
              <>
                <DropdownMenuItem onSelect={() => actions.convert(id, "task")}>
                  <ListTodo />
                  Convert to task
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.convert(id, "note")}>
                  <StickyNote />
                  Convert to note
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={() => actions.addChild(id)}>
              <Plus />
              Add child {label}
              <DropdownMenuShortcut>Tab</DropdownMenuShortcut>
            </DropdownMenuItem>
            {!isRoot && (
              <>
                <DropdownMenuItem
                  onSelect={() => actions.addSibling(id, "after")}
                >
                  <Plus />
                  Add {label} after
                  <DropdownMenuShortcut>o</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.addSibling(id, "before")}
                >
                  <Plus />
                  Add {label} before
                  <DropdownMenuShortcut>O</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
          {!isRoot && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => actions.moveInTree(id, "up")}>
                  <ArrowUp />
                  Move up
                  <DropdownMenuShortcut>^k</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.moveInTree(id, "down")}
                >
                  <ArrowDown />
                  Move down
                  <DropdownMenuShortcut>^j</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.moveInTree(id, "left")}
                >
                  <ArrowLeft />
                  Move left
                  <DropdownMenuShortcut>^h</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.moveInTree(id, "right")}
                >
                  <ArrowRight />
                  Move right
                  <DropdownMenuShortcut>^l</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.remove(id)}>
            <X />
            Remove from mindmap
            <DropdownMenuShortcut>d</DropdownMenuShortcut>
          </DropdownMenuItem>
          {item && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => actions.trashItem(id)}
            >
              <Trash2 />
              Delete {label}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
