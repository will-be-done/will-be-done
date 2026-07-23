import { describe, expect, it } from "vitest";
import { normalizeSpaceBackup, type Backup } from "./backup";

const baseBackup = {
  projects: [],
  dailyLists: [],
  dailyListProjections: [],
  checklistItems: [],
};

describe("space backup compatibility", () => {
  it("normalizes the legacy category shape", () => {
    const normalized = normalizeSpaceBackup({
      ...baseBackup,
      projectCategories: [
        {
          id: "section-1",
          title: "Section",
          projectId: "project-1",
          createdAt: 1,
          orderToken: "a",
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Task",
          state: "todo",
          projectCategoryId: "section-1",
          orderToken: "a",
          lastToggledAt: 1,
          createdAt: 1,
          templateId: null,
          templateDate: null,
        },
      ],
      taskTemplates: [
        {
          id: "template-1",
          title: "Template",
          orderToken: "b",
          repeatRule: "FREQ=DAILY",
          createdAt: 1,
          lastGeneratedAt: 1,
          projectCategoryId: "section-1",
        },
      ],
    });

    expect(normalized.projectSections[0]?.id).toBe("section-1");
    expect(normalized.tasks[0]?.projectSectionId).toBe("section-1");
    expect(normalized.taskTemplates[0]?.projectSectionId).toBe("section-1");
  });

  it("keeps the new format unchanged", () => {
    const backup: Backup = {
      ...baseBackup,
      projectSections: [],
      tasks: [],
      taskTemplates: [],
    };

    expect(normalizeSpaceBackup(backup)).toBe(backup);
  });
});
