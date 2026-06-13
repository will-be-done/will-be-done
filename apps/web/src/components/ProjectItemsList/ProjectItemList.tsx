import { PreloadedTaskComp } from "../Task/Task.tsx";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useMemo, useState } from "react";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb-lib";
import {
  dailyListsSlice,
  projectCategoriesSlice,
  stashProjectionsSlice,
  type Project,
  type ProjectCategory,
} from "@will-be-done/slices/space";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { projectCategoryCardsSlice } from "@will-be-done/slices/space";
import {
  AddLeftIcon,
  AddRightIcon,
  MoveLeftIcon,
  MoveRightIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/ui/icons.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog-service";

const ProjectTasksColumn = ({
  project,
  category,
  exceptTaskIds,
}: {
  project: Project;
  category: ProjectCategory;
  exceptTaskIds?: Set<string>;
}) => {
  const dispatch = useDispatch();

  const cardsForDisplay = useSyncSelector(
    () => projectCategoryCardsSlice.childrenForDisplay(category.id),
    [category.id],
  );
  const doneCardsForDisplay = useSyncSelector(
    () => projectCategoryCardsSlice.doneChildrenForDisplay(category.id),
    [category.id],
  );
  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const isHidden =
    isHiddenClicked ||
    (doneCardsForDisplay.length == 0 && cardsForDisplay.length == 0);
  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    const task = dispatch(
      projectCategoriesSlice.createTask(category.id, "prepend"),
    );

    useFocusStore.getState().editByKey(buildFocusKey(task.id, task.type));
  };
  const handleHideClick = () => setIsHiddenClicked((v) => !v);

  const [isShowMore, setIsShowMore] = useState(false);

  const finalDoneIds = useMemo(() => {
    const ids = (() => {
      if (isShowMore) {
        return doneCardsForDisplay;
      }
      return doneCardsForDisplay.slice(0, 5);
    })();

    return exceptTaskIds
      ? ids.filter((displayData) => !exceptTaskIds.has(displayData.card.id))
      : ids;
  }, [doneCardsForDisplay, exceptTaskIds, isShowMore]);

  return (
    <TasksColumn
      isHidden={isHidden}
      onHideClick={handleHideClick}
      header={
        <>
          <div className="uppercase text-content text-xl font-bold ">
            {category.title}
          </div>
        </>
      }
      columnModelId={category.id}
      columnModelType={category.type}
      onAddClick={handleAddClick}
      actions={
        <>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Add column to the left"
            onClick={() => {
              void (async () => {
                const title = await promptDialog("Enter new name");
                if (!title) return;

                const [left, _right] = dispatch(
                  projectCategoriesSlice.siblings(category.id),
                );

                dispatch(
                  projectCategoriesSlice.createCategory(
                    {
                      projectId: category.projectId,
                      title,
                    },
                    [left, category],
                  ),
                );
              })();
            }}
          >
            <AddLeftIcon />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Add column to the right"
            onClick={() => {
              void (async () => {
                const title = await promptDialog("Enter new name");
                if (!title) return;

                const [_left, right] = dispatch(
                  projectCategoriesSlice.siblings(category.id),
                );

                dispatch(
                  projectCategoriesSlice.createCategory(
                    {
                      projectId: category.projectId,
                      title,
                    },
                    [category, right],
                  ),
                );
              })();
            }}
          >
            <AddRightIcon />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Move column to the left"
            onClick={() => {
              dispatch(projectCategoriesSlice.moveLeft(category.id));
            }}
          >
            <MoveLeftIcon className="rotate-180" />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Move column to the right"
            onClick={() => {
              dispatch(projectCategoriesSlice.moveRight(category.id));
            }}
          >
            <MoveRightIcon className="rotate-180" />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Delete column"
            onClick={() => {
              const confirmed = confirm(
                "Are you sure you want to delete this project category?",
              );
              if (!confirmed) return;

              dispatch(projectCategoriesSlice.deleteCategories([category.id]));
            }}
          >
            <TrashIcon className="rotate-180" />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-6"
            type="button"
            title="Edit column name"
            onClick={() => {
              void (async () => {
                const newTitle = await promptDialog(
                  "Enter new title",
                  category.title,
                );
                if (!newTitle) return;

                dispatch(
                  projectCategoriesSlice.updateCategory(category.id, {
                    title: newTitle,
                  }),
                );
              })();
            }}
          >
            <PencilIcon className="rotate-180" />
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 w-full py-4">
        {(exceptTaskIds
          ? cardsForDisplay.filter(
              (displayData) => !exceptTaskIds.has(displayData.card.id),
            )
          : []
        ).map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.cardWrapper.id}
              card={displayData.card}
              category={displayData.category}
              cardWrapper={displayData.cardWrapper}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              displayedUnderProjectId={project.id}
              displayLastScheduleTime
            />
          );
        })}
        {finalDoneIds.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.cardWrapper.id}
              card={displayData.card}
              category={displayData.category}
              cardWrapper={displayData.cardWrapper}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              displayedUnderProjectId={project.id}
              displayLastScheduleTime
            />
          );
        })}

        {!isShowMore && doneCardsForDisplay.length > 5 && (
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
  exceptDailyListIds,
  exceptStash = false,
}: {
  project: Project;
  exceptDailyListIds?: string[];
  exceptStash?: boolean;
}) => {
  const categories = useSyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const exceptTaskIds = useSyncSelector(
    function* () {
      const dailyTaskIds = yield* dailyListsSlice.allTaskIds(
        exceptDailyListIds ?? [],
      );
      if (!exceptStash) {
        return dailyTaskIds;
      }

      const stashTaskIds = yield* stashProjectionsSlice.allTaskIds();
      return new Set([...dailyTaskIds, ...stashTaskIds]);
    },
    [exceptDailyListIds, exceptStash],
  );

  return (
    <>
      <TasksColumnGrid columnsCount={categories.length}>
        {categories.map((group) => (
          <ProjectTasksColumn
            key={group.id}
            category={group}
            project={project}
            exceptTaskIds={exceptTaskIds}
          />
        ))}
      </TasksColumnGrid>
    </>
  );
};
