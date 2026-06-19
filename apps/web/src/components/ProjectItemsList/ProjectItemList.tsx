import { PreloadedTaskComp } from "../Task/Task.tsx";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useMemo, useState } from "react";
import { useDispatch, useSyncSelector, v } from "@will-be-done/hyperdb-lib";
import { selector } from "@/store/builders.ts";
import {
  createCategory,
  createProjectCategoryTask,
  dailyListAllTaskIds,
  deleteCategories,
  doneProjectCategoryCardsForDisplay,
  moveLeft,
  moveRight,
  type Project,
  projectCategoriesByProjectId,
  type ProjectCategory,
  projectCategoryCardsForDisplayChildren,
  projectCategorySiblings,
  stashProjectionAllTaskIds,
  updateCategory,
} from "@will-be-done/slices/space";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { useRetainedCardsForDisplayList } from "@/store/taskRetentionStore.ts";

const projectItemsExceptTaskIds = selector({
  name: "projectItemsExceptTaskIds",
  args: {
    exceptDailyListIds: v.array(v.string()),
    exceptStash: v.boolean(),
  },
  handler: function* projectItemsExceptTaskIds({
    exceptDailyListIds,
    exceptStash,
  }) {
    const dailyTaskIds = yield* dailyListAllTaskIds({
      dailyListIds: exceptDailyListIds,
    });
    if (!exceptStash) {
      return dailyTaskIds;
    }

    const stashTaskIds = yield* stashProjectionAllTaskIds({});
    return new Set([...dailyTaskIds, ...stashTaskIds]);
  },
});

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

  const cardsForDisplay = useSyncSelector({
    selector: projectCategoryCardsForDisplayChildren,
    args: { projectCategoryId: category.id },
  });
  const doneCardsForDisplay = useSyncSelector({
    selector: doneProjectCategoryCardsForDisplay,
    args: { projectCategoryId: category.id },
  });
  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const handleHideClick = () => setIsHiddenClicked((v) => !v);

  const [isShowMore, setIsShowMore] = useState(false);

  const visibleCardsForDisplay = useMemo(() => {
    return exceptTaskIds
      ? cardsForDisplay.filter(
          (displayData) => !exceptTaskIds.has(displayData.card.id),
        )
      : [];
  }, [cardsForDisplay, exceptTaskIds]);

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
  const renderedCards = useMemo(
    () => [...visibleCardsForDisplay, ...finalDoneIds],
    [finalDoneIds, visibleCardsForDisplay],
  );
  const focusedKey = useFocusStore((state) => state.focusItemKey);
  const { displayItems, retainedItems } = useRetainedCardsForDisplayList({
    listKey: `project-items-list:${category.id}`,
    renderedItems: renderedCards,
    focusedKey,
  });
  const isHidden =
    isHiddenClicked ||
    (retainedItems.length == 0 &&
      doneCardsForDisplay.length == 0 &&
      cardsForDisplay.length == 0);
  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    const task = dispatch(
      createProjectCategoryTask({
        categoryId: category.id,
        position: "prepend",
      }),
    );

    useFocusStore.getState().editByKey(buildFocusKey(task.id, task.type));
  };

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
                  projectCategorySiblings({ categoryId: category.id }),
                );

                dispatch(
                  createCategory({
                    categoryDraft: {
                      projectId: category.projectId,
                      title,
                    },
                    position: [left ?? null, category],
                  }),
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
                  projectCategorySiblings({ categoryId: category.id }),
                );

                dispatch(
                  createCategory({
                    categoryDraft: {
                      projectId: category.projectId,
                      title,
                    },
                    position: [category, right ?? null],
                  }),
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
              dispatch(moveLeft({ categoryId: category.id }));
            }}
          >
            <MoveLeftIcon className="rotate-180" />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Move column to the right"
            onClick={() => {
              dispatch(moveRight({ categoryId: category.id }));
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

              dispatch(deleteCategories({ ids: [category.id] }));
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
                  updateCategory({
                    categoryId: category.id,
                    category: {
                      title: newTitle,
                    },
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
        {displayItems.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.cardWrapper.id}
              card={displayData.card}
              category={displayData.category}
              cardWrapper={displayData.cardWrapper}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              displayedUnderProjectId={project.id}
              hasCheclistItems={displayData.hasChecklist}
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
  const categories = useSyncSelector({
    selector: projectCategoriesByProjectId,
    args: { projectId: project.id },
  });
  const exceptTaskIds = useSyncSelector({
    selector: projectItemsExceptTaskIds,
    args: { exceptDailyListIds: exceptDailyListIds ?? [], exceptStash },
  });

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
