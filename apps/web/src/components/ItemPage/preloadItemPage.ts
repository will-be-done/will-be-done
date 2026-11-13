import {
  preloadSelectorAsync,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import {
  checklistItemChildren,
  dailyEntryDateOfTask,
  isNote,
  isTask,
  isTaskTemplate,
  projectOfProjectSectionOrDefault,
  projectSectionById,
  projectSectionItemById,
  projectSectionsByProjectId,
  taskTemplateById,
  taskTemplateRuleText,
} from "@will-be-done/slices/space";

export async function preloadItemPage(db: SubscribableDB, itemId: string) {
  const item = await preloadSelectorAsync(db, {
    selector: projectSectionItemById,
    args: { id: itemId },
  });
  if (!item) return undefined;

  const promises: Promise<unknown>[] = [
    preloadSelectorAsync(db, {
      selector: projectSectionById,
      args: { id: item.projectSectionId },
    }),
  ];

  if (!isNote(item)) {
    promises.push(
      preloadSelectorAsync(db, {
        selector: checklistItemChildren,
        args: { parentId: item.id, parentType: item.type },
      }),
    );
  }

  const project = await preloadSelectorAsync(db, {
    selector: projectOfProjectSectionOrDefault,
    args: { projectSectionId: item.projectSectionId },
  });
  promises.push(
    preloadSelectorAsync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId: project.id },
    }),
  );

  if (isTask(item)) {
    promises.push(
      preloadSelectorAsync(db, {
        selector: dailyEntryDateOfTask,
        args: { taskId: item.id },
      }),
    );
    if (item.templateId) {
      promises.push(
        preloadSelectorAsync(db, {
          selector: taskTemplateById,
          args: { id: item.templateId },
        }),
        preloadSelectorAsync(db, {
          selector: taskTemplateRuleText,
          args: { id: item.templateId },
        }),
      );
    }
  }

  if (isTaskTemplate(item)) {
    promises.push(
      preloadSelectorAsync(db, {
        selector: taskTemplateRuleText,
        args: { id: item.id },
      }),
    );
  }

  await Promise.all(promises);
  return item;
}
