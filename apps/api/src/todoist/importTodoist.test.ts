import { describe, it, expect } from "bun:test";
import { todoistRecurrenceToRRule, buildBackup } from "./importTodoist";
import type {
  Task as TodoistTask,
  PersonalProject,
  WorkspaceProject,
  Section as TodoistSection,
} from "@doist/todoist-api-typescript";
import projectsFixture from "./fixtures/projects.json";
import sectionsFixture from "./fixtures/sections.json";
import activeTasksFixture from "./fixtures/activeTasks.json";
import completedTasksFixture from "./fixtures/completedTasks.json";

// ---------------------------------------------------------------------------
// todoistRecurrenceToRRule
// ---------------------------------------------------------------------------

describe("todoistRecurrenceToRRule", () => {
  it.each([
    ["every day", "FREQ=DAILY;INTERVAL=1"],
    ["daily", "FREQ=DAILY;INTERVAL=1"],
    ["every week", "FREQ=WEEKLY;INTERVAL=1"],
    ["weekly", "FREQ=WEEKLY;INTERVAL=1"],
    ["every month", "FREQ=MONTHLY;INTERVAL=1"],
    ["monthly", "FREQ=MONTHLY;INTERVAL=1"],
    ["every year", "FREQ=YEARLY;INTERVAL=1"],
    ["yearly", "FREQ=YEARLY;INTERVAL=1"],
    ["annually", "FREQ=YEARLY;INTERVAL=1"],
    ["every 3 days", "FREQ=DAILY;INTERVAL=3"],
    ["every monday", "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"],
    ["every other day", "FREQ=DAILY;INTERVAL=2"],
    ["every other monday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"],
  ])("%s → %s", (input, expected) => {
    expect(todoistRecurrenceToRRule(input)).toBe(expected);
  });

  it("returns null for unrecognized patterns", () => {
    expect(todoistRecurrenceToRRule("every workday")).toBeNull();
    expect(todoistRecurrenceToRRule("something random")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBackup with real fixtures
// ---------------------------------------------------------------------------

const projects = projectsFixture as unknown as (
  | PersonalProject
  | WorkspaceProject
)[];
const sections = sectionsFixture as unknown as TodoistSection[];
const allTasks = [
  ...activeTasksFixture,
  ...completedTasksFixture,
] as unknown as TodoistTask[];

describe("buildBackup", () => {
  const backup = buildBackup(projects, sections, allTasks);

  // -- Projects -----------------------------------------------------------

  describe("projects", () => {
    it("maps all 4 projects", () => {
      expect(backup.projects).toHaveLength(4);
    });

    it("detects the inbox project", () => {
      const inbox = backup.projects.find((p) => p.isInbox);
      expect(inbox).toBeDefined();
      expect(inbox!.title).toBe("Inbox");
    });

    it("preserves project titles", () => {
      const titles = backup.projects.map((p) => p.title);
      expect(titles).toEqual(["Inbox", "Test project", "Топ лего", "Заказать"]);
    });

    it("generates sequential orderTokens", () => {
      const tokens = backup.projects.map((p) => p.orderToken);
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i] > tokens[i - 1]).toBe(true);
      }
    });
  });

  // -- Categories ---------------------------------------------------------

  describe("projectCategories", () => {
    it("creates a default 'Tasks' category for each project", () => {
      for (const proj of backup.projects) {
        const cats = backup.projectCategories.filter(
          (c) => c.projectId === proj.id,
        );
        expect(cats.length).toBeGreaterThanOrEqual(1);
        expect(cats[0].title).toBe("Tasks");
      }
    });

    it("Test project has 4 categories (1 default + 3 sections)", () => {
      const testProj = backup.projects.find((p) => p.title === "Test project")!;
      const cats = backup.projectCategories.filter(
        (c) => c.projectId === testProj.id,
      );
      expect(cats).toHaveLength(4);
      expect(cats.map((c) => c.title)).toEqual([
        "Tasks",
        "sectoin 1",
        "section 2",
        "section 3",
      ]);
    });

    it("categories within a project are ordered by sectionOrder", () => {
      const testProj = backup.projects.find((p) => p.title === "Test project")!;
      const cats = backup.projectCategories.filter(
        (c) => c.projectId === testProj.id,
      );
      const tokens = cats.map((c) => c.orderToken);
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i] > tokens[i - 1]).toBe(true);
      }
    });
  });

  // -- Tasks --------------------------------------------------------------

  describe("tasks", () => {
    it("all active non-recurring tasks have state 'todo'", () => {
      const activeTitles = new Set(
        activeTasksFixture
          .filter(
            (t) =>
              !t.checked &&
              !(t.due?.isRecurring && todoistRecurrenceToRRule(t.due?.string)),
          )
          .map((t) => t.content),
      );
      for (const task of backup.tasks) {
        if (activeTitles.has(task.title)) {
          expect(task.state).toBe("todo");
        }
      }
    });

    it("maps content → title and description → content", () => {
      const task = backup.tasks.find((t) => t.title === "Task 1");
      expect(task).toBeDefined();
      expect(task!.content).toBe("Description 1");
    });

    it("tasks with no section go to default category", () => {
      // "Task 1" is in project "Топ лего" with no section
      const legoProj = backup.projects.find((p) => p.title === "Топ лего")!;
      const defaultCat = backup.projectCategories.find(
        (c) => c.projectId === legoProj.id && c.title === "Tasks",
      )!;
      const task = backup.tasks.find((t) => t.title === "Task 1");
      expect(task!.projectCategoryId).toBe(defaultCat.id);
    });

    it("tasks within a category are sorted by childOrder", () => {
      // Pick a category with multiple tasks and verify orderToken ordering
      const catIds = [...new Set(backup.tasks.map((t) => t.projectCategoryId))];
      for (const catId of catIds) {
        const catTasks = backup.tasks.filter(
          (t) => t.projectCategoryId === catId,
        );
        if (catTasks.length < 2) continue;
        const tokens = catTasks.map((t) => t.orderToken);
        for (let i = 1; i < tokens.length; i++) {
          expect(tokens[i] > tokens[i - 1]).toBe(true);
        }
      }
    });
  });

  // -- Recurring tasks / TaskTemplates ------------------------------------

  describe("recurring tasks", () => {
    it("creates a TaskTemplate for 'every day' recurring task", () => {
      expect(backup.taskTemplates.length).toBeGreaterThanOrEqual(1);
      const tpl = backup.taskTemplates.find(
        (t) => t.repeatRule === "FREQ=DAILY;INTERVAL=1",
      );
      expect(tpl).toBeDefined();
    });

    it("unrecognized recurrence patterns fall back to regular tasks", () => {
      // All recurring tasks in fixtures use "every day" which is recognized,
      // so there should be no template with an unrecognized pattern.
      // This test verifies the count: exactly 1 template for 1 recurring task.
      expect(backup.taskTemplates).toHaveLength(1);
    });
  });

  // -- Daily lists --------------------------------------------------------

  describe("daily lists", () => {
    it("tasks with due dates create daily lists", () => {
      expect(backup.dailyLists.length).toBeGreaterThan(0);
    });

    it("daily list ids match their date keys", () => {
      for (const dl of backup.dailyLists) {
        expect(dl.id).toBe(dl.date);
        expect(dl.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("tasks with the same due date share a daily list", () => {
      // Multiple tasks have due date 2026-03-04
      const projections = backup.dailyListProjections!.filter(
        (p) => p.listId === "2026-03-04",
      );
      expect(projections.length).toBeGreaterThan(1);
    });

    it("each projection references a valid daily list", () => {
      const listIds = new Set(backup.dailyLists.map((dl) => dl.id));
      for (const proj of backup.dailyListProjections!) {
        expect(listIds.has(proj.listId)).toBe(true);
      }
    });
  });
});
