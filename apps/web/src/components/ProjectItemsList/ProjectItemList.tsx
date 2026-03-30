import { TaskComp } from "../Task/Task.tsx";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useMemo, useState } from "react";
import { useAsyncDispatch, useAsyncSelector } from "@will-be-done/hyperdb";
import {
  dailyListsSlice,
  projectCategoriesSlice,
  type Project,
  type ProjectCategory,
} from "@will-be-done/slices/space";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { projectCategoryCardsSlice, type CardWrapperType } from "@will-be-done/slices/space";
import {
  AddLeftIcon,
  AddRightIcon,
  MoveLeftIcon,
  MoveRightIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/ui/icons.tsx";
import { promptDialog } from "@/components/ui/prompt-dialog";

const ProjectTasksColumn = ({
  project,
  category,
  exceptTaskIds,
}: {
  project: Project;
  category: ProjectCategory;
  exceptTaskIds?: Set<string>;
}) => {
  const cardsWithTypesResult = useAsyncSelector(
    () => projectCategoryCardsSlice.childrenIdsWithTypes(category.id),
    [category.id],
  );
  const doneTaskIdsResult = useAsyncSelector(
    () => projectCategoryCardsSlice.doneChildrenIds(category.id),
    [category.id],
  );

  if (cardsWithTypesResult.isPending || doneTaskIdsResult.isPending) return null;

  return (
    <ProjectTasksColumnComp
      project={project}
      category={category}
      exceptTaskIds={exceptTaskIds}
      cardsWithTypes={cardsWithTypesResult.data!}
      doneTaskIds={doneTaskIdsResult.data!}
    />
  );
};

const ProjectTasksColumnComp = ({
  project,
  category,
  exceptTaskIds,
  cardsWithTypes,
  doneTaskIds,
}: {
  project: Project;
  category: ProjectCategory;
  exceptTaskIds?: Set<string>;
  cardsWithTypes: { id: string; type: CardWrapperType }[];
  doneTaskIds: string[];
}) => {
  const dispatch = useAsyncDispatch();

  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const [isShowMore, setIsShowMore] = useState(false);

  const finalDoneIds = useMemo(() => {
    const ids = (() => {
      if (isShowMore) {
        return doneTaskIds;
      }
      return doneTaskIds.slice(0, 5);
    })();

    return exceptTaskIds ? ids.filter((id) => !exceptTaskIds.has(id)) : ids;
  }, [doneTaskIds, exceptTaskIds, isShowMore]);

  const isHidden =
    isHiddenClicked || (doneTaskIds.length == 0 && cardsWithTypes.length == 0);
  const handleAddClick = () => {
    if (isHidden) {
      setIsHiddenClicked(false);
    }

    void dispatch(
      projectCategoriesSlice.createTask(category.id, "prepend"),
    ).then((task) => {
      useFocusStore.getState().editByKey(buildFocusKey(task.id, task.type));
    });
  };
  const handleHideClick = () => setIsHiddenClicked((v) => !v);

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

                void dispatch(
                  projectCategoriesSlice.siblings(category.id),
                ).then(([left, _right]) => {
                  void dispatch(
                    projectCategoriesSlice.createCategory(
                      {
                        projectId: category.projectId,
                        title,
                      },
                      [left, category],
                    ),
                  );
                });
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

                void dispatch(
                  projectCategoriesSlice.siblings(category.id),
                ).then(([_left, right]) => {
                  void dispatch(
                    projectCategoriesSlice.createCategory(
                      {
                        projectId: category.projectId,
                        title,
                      },
                      [category, right],
                    ),
                  );
                });
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
              void dispatch(projectCategoriesSlice.moveLeft(category.id));
            }}
          >
            <MoveLeftIcon className="rotate-180" />
          </button>
          <button
            className="hidden group-hover:block cursor-pointer text-white mb-2"
            type="button"
            title="Move column to the right"
            onClick={() => {
              void dispatch(projectCategoriesSlice.moveRight(category.id));
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

              void dispatch(projectCategoriesSlice.deleteCategories([category.id]));
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
                const newTitle = await promptDialog("Enter new title", category.title);
                if (!newTitle) return;

                void dispatch(
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
          ? cardsWithTypes.filter(({ id }) => !exceptTaskIds.has(id))
          : []
        ).map(({ id, type }) => {
          return (
            <TaskComp
              key={id}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType={type}
              displayedUnderProjectId={project.id}
              displayLastScheduleTime
            />
          );
        })}
        {finalDoneIds.map((id) => {
          return (
            <TaskComp
              key={id}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="task"
              displayedUnderProjectId={project.id}
              displayLastScheduleTime
            />
          );
        })}

        {!isShowMore && doneTaskIds.length > 5 && (
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
}: {
  project: Project;
  exceptDailyListIds?: string[];
}) => {
  const categoriesResult = useAsyncSelector(
    () => projectCategoriesSlice.byProjectId(project.id),
    [project.id],
  );
  const exceptTaskIdsResult = useAsyncSelector(
    () => dailyListsSlice.allTaskIds(exceptDailyListIds ?? []),
    [exceptDailyListIds],
  );

  if (categoriesResult.isPending || exceptTaskIdsResult.isPending) return null;

  return (
    <ProjectItemsListComp
      project={project}
      exceptDailyListIds={exceptDailyListIds}
      categories={categoriesResult.data!}
      exceptTaskIds={exceptTaskIdsResult.data!}
    />
  );
};

const ProjectItemsListComp = ({
  project,
  categories,
  exceptTaskIds,
}: {
  project: Project;
  exceptDailyListIds?: string[];
  categories: ProjectCategory[];
  exceptTaskIds: Set<string>;
}) => {
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
