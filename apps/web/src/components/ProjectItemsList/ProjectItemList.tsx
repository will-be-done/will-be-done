import { PreloadedTaskComp } from "../Task/Task.tsx";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useMemo, useState } from "react";
import { startOfDay } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createProjectSection,
  createTaskInSection,
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
  ArrowLeft,
  ArrowRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { promptDialog } from "@/components/ui/prompt-dialog-service";
import { captureWebAnalytics } from "@/lib/analytics";
import { useUndoToast } from "@/store/undo";

const ProjectSectionMenu = ({
  section,
  isFirst,
  isLast,
}: {
  section: ProjectSection;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const dispatch = useAsyncDispatch();
  const deleteWithUndo = useUndoToast();

  const handleRename = async () => {
    const newTitle = await promptDialog("Enter new title", section.title);
    if (!newTitle) return;

    await dispatch(
      updateProjectSection({
        projectSectionId: section.id,
        section: { title: newTitle },
      }),
    );
  };

  const handleAdd = async (side: "left" | "right") => {
    const title = await promptDialog("Enter new name");
    if (!title) return;

    const [left, right] = await dispatch(
      projectSectionSiblings({ projectSectionId: section.id }),
    );

    await dispatch(
      createProjectSection({
        sectionDraft: { projectId: section.projectId, title },
        position:
          side === "left" ? [left ?? null, section] : [section, right ?? null],
      }),
    );
  };

  const handleDelete = () => {
    void deleteWithUndo(() =>
      dispatch(deleteProjectSections({ ids: [section.id] })),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="invisible group-hover:visible pointer-coarse:visible data-[state=open]:visible cursor-pointer text-white mb-2"
          type="button"
          aria-label="Column actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="min-w-48">
        <DropdownMenuItem onSelect={() => void handleRename()}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isFirst}
          onSelect={() =>
            void dispatch(moveLeft({ projectSectionId: section.id }))
          }
        >
          <ArrowLeft />
          Move left
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isLast}
          onSelect={() =>
            void dispatch(moveRight({ projectSectionId: section.id }))
          }
        >
          <ArrowRight />
          Move right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleAdd("left")}>
          <ArrowLeftToLine />
          Add column left
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleAdd("right")}>
          <ArrowRightToLine />
          Add column right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
          <Trash2 />
          Delete column
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ProjectTasksColumn = ({
  project,
  section,
  timelineDays,
  isFirst,
  isLast,
}: {
  project: Project;
  section: ProjectSection;
  timelineDays?: DayRange;
  isFirst: boolean;
  isLast: boolean;
}) => {
  const dispatch = useAsyncDispatch();

  const isOnTimeline = (lastScheduleTime: Date | undefined) => {
    if (!lastScheduleTime || !timelineDays) return false;
    const day = startOfDay(lastScheduleTime).getTime();
    return day >= timelineDays.from && day <= timelineDays.to;
  };

  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: projectSectionItemsForDisplayChildren,
    args: { projectSectionId: section.id },
  });
  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const handleHideClick = () => setIsHiddenClicked((v) => !v);

  const [isShowMore, setIsShowMore] = useState(false);
  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneProjectSectionItemsForDisplay,
    args: { projectSectionId: section.id, limited: !isShowMore },
  });

  const isHidden =
    isHiddenClicked ||
    (doneItemsForDisplay.length == 0 && itemsForDisplay.length == 0);
  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    void (async () => {
      const task = await dispatch(
        createTaskInSection({
          projectSectionId: section.id,
          position: "prepend",
        }),
      );
      captureWebAnalytics({
        name: "task_created",
        properties: { creation_method: "add_button", location: "project" },
      });

      useFocusStore.getState().editByKey(buildFocusKey(task.id, task.type));
    })();
  };

  const finalDoneIds = useMemo(() => {
    if (isShowMore) {
      return doneItemsForDisplay;
    }
    return doneItemsForDisplay.slice(0, 5);
  }, [doneItemsForDisplay, isShowMore]);

  return (
    <TasksColumn
      isHidden={isHidden}
      onHideClick={handleHideClick}
      header={
        <>
          <div className="uppercase text-content text-xl font-bold ">
            {section.title}
          </div>
        </>
      }
      columnModelId={section.id}
      columnModelType={section.type}
      columnProjectId={section.projectId}
      onAddClick={handleAddClick}
      actions={
        <ProjectSectionMenu
          section={section}
          isFirst={isFirst}
          isLast={isLast}
        />
      }
    >
      <div className="flex flex-col gap-4 w-full py-4">
        {itemsForDisplay.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.listItem.id}
              item={displayData.item}
              section={displayData.section}
              listItem={displayData.listItem}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              scheduledTime={displayData.scheduledTime}
              dailyListId={displayData.dailyList?.id}
              displayedUnderProjectId={project.id}
              hasCheclistItems={displayData.hasChecklist}
              displayLastScheduleTime
              isOnTimeline={isOnTimeline(displayData.lastScheduleTime)}
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
              scheduledTime={displayData.scheduledTime}
              dailyListId={displayData.dailyList?.id}
              displayedUnderProjectId={project.id}
              hasCheclistItems={displayData.hasChecklist}
              displayLastScheduleTime
              isOnTimeline={isOnTimeline(displayData.lastScheduleTime)}
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

// Start-of-day timestamps, inclusive.
export type DayRange = { from: number; to: number };

export const ProjectItemsList = ({
  project,
  timelineDays,
  isFocusRegion = true,
}: {
  project: Project;
  // Tasks scheduled on these days get the "on timeline" outline.
  timelineDays?: DayRange;
  isFocusRegion?: boolean;
}) => {
  const { data: sections = [] } = useAsyncSelector({
    selector: projectSectionsByProjectId,
    args: { projectId: project.id },
  });

  return (
    <>
      <TasksColumnGrid
        columnsCount={sections.length}
        isFocusRegion={isFocusRegion}
      >
        {sections.map((group, i) => (
          <ProjectTasksColumn
            key={group.id}
            section={group}
            project={project}
            timelineDays={timelineDays}
            isFirst={i === 0}
            isLast={i === sections.length - 1}
          />
        ))}
      </TasksColumnGrid>
    </>
  );
};
