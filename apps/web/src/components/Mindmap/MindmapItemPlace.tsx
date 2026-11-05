import { useState } from "react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  type MindmapTreeNode,
  projectSectionsByProjectId,
  updateNote,
  updateTask,
} from "@will-be-done/slices/space";
import { format } from "date-fns";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";

const placeButtonClass =
  "min-w-0 cursor-pointer truncate rounded px-0.5 -mx-0.5 transition-colors hover:bg-white/10 hover:text-content";

// "Project · Section · date" under a task or note; project and section open
// pickers to change them.
export function MindmapItemPlace({
  id,
  tree,
  actions,
  scheduledAt,
}: {
  id: string;
  tree: MindmapTreeNode;
  actions: MindmapNodeActions;
  scheduledAt: Date | undefined;
}) {
  const dispatch = useAsyncDispatch();
  const [isPickingSection, setIsPickingSection] = useState(false);
  const { task, note, project, section } = tree;
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project?.id ?? "" },
    enabled: isPickingSection && !!project,
  });
  if (!project && !scheduledAt) return null;

  const moveToSection = (projectSectionId: string) => {
    if (task) {
      void dispatch(updateTask({ id: task.id, task: { projectSectionId } }));
    } else if (note) {
      void dispatch(updateNote({ id: note.id, note: { projectSectionId } }));
    }
  };

  return (
    <div
      className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-normal text-content-tinted/60"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {project && (
        <button
          type="button"
          tabIndex={-1}
          title="Move to project (m)"
          className={placeButtonClass}
          onClick={() => actions.moveToProject(id)}
        >
          {project.icon} {project.title}
        </button>
      )}
      {project && section && (
        <>
          <span aria-hidden>·</span>
          <DropdownMenu
            open={isPickingSection}
            onOpenChange={setIsPickingSection}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                title="Change section"
                className={placeButtonClass}
              >
                {section.title || "Untitled section"}
              </button>
            </DropdownMenuTrigger>
            {isPickingSection && (
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="min-w-40 bg-task-dropdown shadow-2xl ring-0 backdrop-blur-none"
              >
                {sections.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() => moveToSection(option.id)}
                  >
                    <Check
                      className={
                        option.id === section.id ? undefined : "invisible"
                      }
                    />
                    {option.title || "Untitled section"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        </>
      )}
      {project && scheduledAt && <span aria-hidden>·</span>}
      {scheduledAt && (
        <span className="shrink-0">{format(scheduledAt, "MMM d")}</span>
      )}
    </div>
  );
}
