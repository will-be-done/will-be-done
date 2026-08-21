import { PreloadedTaskComp } from "../Task/Task.tsx";
import { AddTaskComposer } from "../Task/AddTaskComposer.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createProjectSection,
  deleteProjectSections,
  doneProjectSectionItemsForDisplay,
  moveLeft,
  moveRight,
  type Project,
  projectSectionsByProjectId,
  type ProjectSection,
  projectSectionItemsForDisplayChildren,
  projectSectionSiblings,
  updateProjectSection,
} from "@will-be-done/slices/space";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";

import {
  AddLeftIcon,
  AddRightIcon,
  MoveLeftIcon,
  MoveRightIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const toSentenceCase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const ProjectTasksColumn = ({
  project,
  section,
  weekDayTimes,
}: {
  project: Project;
  section: ProjectSection;
  weekDayTimes?: Set<number>;
}) => {
  const dispatch = useAsyncDispatch();

  const isOnDisplayedWeek = (lastScheduleTime: Date | undefined) =>
    !!lastScheduleTime &&
    !!weekDayTimes?.has(startOfDay(lastScheduleTime).getTime());

  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: projectSectionItemsForDisplayChildren,
    args: { projectSectionId: section.id },
  });
  const [isShowMore, setIsShowMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(
    () => toSentenceCase(section.title) || section.title,
  );
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneProjectSectionItemsForDisplay,
    args: { projectSectionId: section.id, limited: !isShowMore },
  });

  useEffect(() => {
    setTitleDraft(toSentenceCase(section.title) || section.title);
  }, [section.title]);

  const handleAddTask = () => {
    setComposerOpen(true);
  };

  const handleAddColumn = (side: "left" | "right") => {
    void (async () => {
      const title = await promptDialog("Enter new name");
      if (!title) return;

      const [left, right] = await dispatch(
        projectSectionSiblings({ projectSectionId: section.id }),
      );

      await dispatch(
        createProjectSection({
          sectionDraft: {
            projectId: section.projectId,
            title,
          },
          position:
            side === "left"
              ? [left ?? null, section]
              : [section, right ?? null],
        }),
      );
    })();
  };

  const saveTitle = (value: string) => {
    const nextTitle = toSentenceCase(value);
    if (!nextTitle || nextTitle === section.title) {
      setTitleDraft(section.title);
      return;
    }

    setTitleDraft(nextTitle);
    void dispatch(
      updateProjectSection({
        projectSectionId: section.id,
        section: {
          title: nextTitle,
        },
      }),
    );
  };

  const handleEditTitle = () => {
    requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
  };

  const handleDelete = () => {
    const confirmed = confirm(
      "Are you sure you want to delete this project section?",
    );
    if (!confirmed) return;

    void dispatch(deleteProjectSections({ ids: [section.id] }));
  };

  const finalDoneIds = useMemo(() => {
    if (isShowMore) {
      return doneItemsForDisplay;
    }
    return doneItemsForDisplay.slice(0, 5);
  }, [doneItemsForDisplay, isShowMore]);

  return (
    <TasksColumn
      isHidden={false}
      panelWidth={320}
      header={
        <input
          ref={titleInputRef}
          type="text"
          value={titleDraft}
          aria-label="Section name"
          placeholder="Untitled"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="w-full min-w-0 bg-transparent text-content text-lg font-bold cursor-text focus:outline-none placeholder:italic placeholder:text-content-tinted"
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={(e) => saveTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.value = section.title;
              setTitleDraft(section.title);
              e.currentTarget.blur();
            }
          }}
        />
      }
      columnModelId={section.id}
      columnModelType={section.type}
      onAddClick={handleAddTask}
      actions={
        <>
          <AddTaskComposer
            destination={{ type: "section", projectSectionId: section.id }}
            defaultProjectId={project.id}
            showProject={false}
            open={composerOpen}
            onOpenChange={setComposerOpen}
          >
            <button
              type="button"
              aria-label="Add task"
              className="flex size-7 items-center justify-center rounded-md text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
            >
              <PlusIcon />
            </button>
          </AddTaskComposer>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Section actions"
                className="flex size-7 items-center justify-center rounded-md text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={handleAddTask}>
                  <PlusIcon />
                  Add task
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => handleAddColumn("left")}>
                  <AddLeftIcon />
                  Add column to the left
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAddColumn("right")}>
                  <AddRightIcon />
                  Add column to the right
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void dispatch(moveLeft({ projectSectionId: section.id }));
                  }}
                >
                  <MoveLeftIcon />
                  Move left
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void dispatch(moveRight({ projectSectionId: section.id }));
                  }}
                >
                  <MoveRightIcon />
                  Move right
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={handleEditTitle}>
                  <PencilIcon />
                  Edit name
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="flex flex-col gap-4 w-full">
        {itemsForDisplay.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.listItem.id}
              item={displayData.item}
              section={displayData.section}
              listItem={displayData.listItem}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              displayedUnderProjectId={project.id}
              hasCheclistItems={displayData.hasChecklist}
              displayLastScheduleTime
              isOnTimeline={isOnDisplayedWeek(displayData.lastScheduleTime)}
            />
          );
        })}
        {finalDoneIds.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.listItem.id}
              item={displayData.item}
              section={displayData.section}
              listItem={displayData.listItem}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              displayedUnderProjectId={project.id}
              hasCheclistItems={displayData.hasChecklist}
              displayLastScheduleTime
              isOnTimeline={isOnDisplayedWeek(displayData.lastScheduleTime)}
            />
          );
        })}

        {!isShowMore && doneItemsForDisplay.length > 5 && (
          <button
            onClick={() => setIsShowMore(true)}
            className="cursor-pointer text-subheader text-sm"
          >
            Show More
          </button>
        )}
      </div>
    </TasksColumn>
  );
};

export const ProjectItemsList = ({
  project,
  selectedDate,
}: {
  project: Project;
  selectedDate?: Date;
}) => {
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project.id },
  });

  const weekDayTimes = useMemo(() => {
    if (!selectedDate) return undefined;
    const start = startOfDay(selectedDate);
    return new Set(
      Array.from({ length: 7 }, (_, i) => addDays(start, i).getTime()),
    );
  }, [selectedDate]);

  return (
    <>
      <TasksColumnGrid>
        {sections.map((group) => (
          <ProjectTasksColumn
            key={group.id}
            section={group}
            project={project}
            weekDayTimes={weekDayTimes}
          />
        ))}
      </TasksColumnGrid>
    </>
  );
};
