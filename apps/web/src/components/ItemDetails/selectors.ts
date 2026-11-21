import { v } from "@will-be-done/hyperdb";
import {
  checklistItemChildren,
  dailyEntryByTaskId,
  dailyEntryDateOfTask,
  type Item,
  itemAttachments,
  mindmapsOfItem,
  noteType,
  projectOfProjectSectionOrDefault,
  projectSectionsByProjectId,
  taskTemplateById,
  taskTemplateRuleText,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import { selector } from "@/store/builders.ts";

const detailsArgs = {
  id: v.string(),
  type: v.union(
    v.literal(taskType),
    v.literal(taskTemplateType),
    v.literal(noteType),
  ),
  projectSectionId: v.string(),
  templateId: v.optional(v.string()),
};

// Reads what the details bodies show besides the item itself. Keep it in step
// with the bodies' selectors. It takes plain fields so a conversion can read
// ahead for an item that doesn't exist yet.
export const itemDetailsData = selector({
  name: "itemDetailsData",
  args: detailsArgs,
  handler: function* itemDetailsData({
    id,
    type,
    projectSectionId,
    templateId,
  }) {
    const project = yield* projectOfProjectSectionOrDefault({
      projectSectionId,
    });
    yield* projectSectionsByProjectId({ projectId: project.id });
    yield* itemAttachments({ parentType: type, parentId: id });
    yield* mindmapsOfItem({ id });
    if (type === noteType) return;

    yield* checklistItemChildren({ parentId: id, parentType: type });
    if (type === taskType) {
      yield* dailyEntryDateOfTask({ taskId: id });
      yield* dailyEntryByTaskId({ taskId: id });
    }
    if (templateId) {
      yield* taskTemplateById({ id: templateId });
      yield* taskTemplateRuleText({ id: templateId });
    }
  },
});

export const itemDetailsFields = (item: Item) => {
  const templateId =
    item.type === taskTemplateType
      ? item.id
      : item.type === taskType
        ? item.templateId
        : undefined;
  return {
    id: item.id,
    type: item.type,
    projectSectionId: item.projectSectionId,
    ...(templateId && { templateId }),
  };
};
