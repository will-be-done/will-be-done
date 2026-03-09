import { describe, expect, it } from "vitest";
import { parseCSV, parseTickTickCSV } from "./ticktick";

// TickTick CSV prefix: 3 metadata rows + 1 header row
const METADATA =
  '"Date: 2026-03-08+0000"\n' +
  '"Version: 7.1"\n' +
  '"Status: \n0 Normal\n1 Completed\n2 Archived"\n' +
  '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"\n';

/**
 * Build a data row string. Only the fields used by the importer matter;
 * the rest are filled with empty values.
 */
function makeRow(opts: {
  folder?: string;
  list?: string;
  title?: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  repeat?: string;
  status?: string;
  createdTime?: string;
  completedTime?: string;
  order?: string;
}): string {
  const {
    folder = "Folder",
    list = "List",
    title = "Task",
    content = "",
    startDate = "",
    dueDate = "",
    repeat = "",
    status = "0",
    createdTime = "2024-01-01T00:00:00+0000",
    completedTime = "",
    order = "0",
  } = opts;

  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  // 24 columns: Folder, List, Title, Kind, Tags, Content, IsChecklist,
  //             StartDate, DueDate, Reminder, Repeat, Priority, Status,
  //             CreatedTime, CompletedTime, Order, Timezone, IsAllDay,
  //             IsFloating, ColumnName, ColumnOrder, ViewMode, taskId, parentId
  return [
    q(folder),
    q(list),
    q(title),
    q("TEXT"),
    q(""),
    q(content),
    q("N"),
    q(startDate),
    q(dueDate),
    q(""),
    q(repeat),
    q("0"),
    q(status),
    q(createdTime),
    q(completedTime),
    q(order),
    q("UTC"),
    q("false"),
    q("false"),
    q(""),
    q("0"),
    q("list"),
    q("1"),
    q(""),
  ].join(",");
}

describe("parseCSV", () => {
  it("parses simple unquoted fields", () => {
    const result = parseCSV("a,b,c\nd,e,f\n");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const result = parseCSV('"hello, world","foo"\n');
    expect(result[0]).toEqual(["hello, world", "foo"]);
  });

  it("handles quoted fields with newlines", () => {
    const result = parseCSV('"line1\nline2","next"\n');
    expect(result[0]).toEqual(["line1\nline2", "next"]);
    expect(result).toHaveLength(1);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const result = parseCSV('"say ""hello""","ok"\n');
    expect(result[0]).toEqual(['say "hello"', "ok"]);
  });
});

describe("parseTickTickCSV", () => {
  it("imports a single task into the correct project and category", () => {
    const csv =
      METADATA + makeRow({ folder: "Work", list: "Inbox", title: "Buy milk" });
    const backup = parseTickTickCSV(csv);

    // One project per (folder, list) pair, titled "Folder/List"
    expect(backup.projects).toHaveLength(1);
    expect(backup.projects[0]!.title).toBe("Work/Inbox");
    expect(backup.projects[0]!.isInbox).toBe(false);

    // One default category per project
    expect(backup.projectCategories).toHaveLength(1);
    expect(backup.projectCategories[0]!.title).toBe("Tasks");
    expect(backup.projectCategories[0]!.projectId).toBe(backup.projects[0]!.id);

    expect(backup.tasks).toHaveLength(1);
    expect(backup.tasks[0]!.title).toBe("Buy milk");
    expect(backup.tasks[0]!.state).toBe("todo");
    expect(backup.tasks[0]!.projectCategoryId).toBe(
      backup.projectCategories[0]!.id,
    );

    expect(backup.taskTemplates).toHaveLength(0);
    expect(backup.dailyLists).toHaveLength(0);
  });

  it("creates one project per unique (folder, list) pair titled 'Folder/List'", () => {
    const rows = [
      makeRow({ folder: "Work", list: "Inbox" }),
      makeRow({ folder: "Work", list: "Projects" }),
      makeRow({ folder: "Personal", list: "Inbox" }),
      makeRow({ folder: "Personal", list: "Hobbies" }),
    ].join("\n");
    const backup = parseTickTickCSV(METADATA + rows);

    // 4 (folder, list) pairs → 4 projects, 4 categories (one per project)
    expect(backup.projects).toHaveLength(4);
    expect(backup.projectCategories).toHaveLength(4);

    const titles = backup.projects.map((p) => p.title).sort();
    expect(titles).toEqual([
      "Personal/Hobbies",
      "Personal/Inbox",
      "Work/Inbox",
      "Work/Projects",
    ]);

    // Each project has exactly one category
    for (const project of backup.projects) {
      const cats = backup.projectCategories.filter(
        (c) => c.projectId === project.id,
      );
      expect(cats).toHaveLength(1);
    }
  });

  it("maps Status=0 to todo, Status=1 to done, Status=2 to done", () => {
    const rows = [
      makeRow({ title: "Active", status: "0" }),
      makeRow({
        title: "Completed",
        status: "1",
        completedTime: "2024-02-01T00:00:00+0000",
      }),
      makeRow({
        title: "Archived",
        status: "2",
        completedTime: "2024-03-01T00:00:00+0000",
      }),
    ].join("\n");
    const backup = parseTickTickCSV(METADATA + rows);

    expect(backup.tasks).toHaveLength(3);
    const active = backup.tasks.find((t) => t.title === "Active")!;
    const completed = backup.tasks.find((t) => t.title === "Completed")!;
    const archived = backup.tasks.find((t) => t.title === "Archived")!;

    expect(active.state).toBe("todo");
    expect(completed.state).toBe("done");
    expect(archived.state).toBe("done");

    // lastToggledAt should use completedTime when available
    expect(completed.lastToggledAt).toBe(
      new Date("2024-02-01T00:00:00+0000").getTime(),
    );
  });

  it("imports active recurring task as TaskTemplate", () => {
    const row = makeRow({
      title: "Daily standup",
      repeat: "FREQ=DAILY;INTERVAL=1",
      status: "0",
      startDate: "2024-01-01T09:00:00+0000",
    });
    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.taskTemplates).toHaveLength(1);
    expect(backup.tasks).toHaveLength(0);

    const template = backup.taskTemplates[0]!;
    expect(template.title).toBe("Daily standup");
    expect(template.repeatRule).toBe("FREQ=DAILY;INTERVAL=1");
    expect(template.repeatRuleDtStart).toBe(
      new Date("2024-01-01T09:00:00+0000").getTime(),
    );
    expect(template.horizon).toBe("someday");
  });

  it("imports completed recurring task as a done Task (not a template)", () => {
    const row = makeRow({
      title: "Weekly review",
      repeat: "FREQ=WEEKLY;INTERVAL=1",
      status: "1",
      completedTime: "2024-01-07T00:00:00+0000",
    });
    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.taskTemplates).toHaveLength(0);
    expect(backup.tasks).toHaveLength(1);
    expect(backup.tasks[0]!.state).toBe("done");
    expect(backup.tasks[0]!.title).toBe("Weekly review");
  });

  it("populates task content from the Content column", () => {
    const row = makeRow({
      title: "Research",
      content: "Some detailed notes here",
    });
    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.tasks).toHaveLength(1);
    expect(backup.tasks[0]!.content).toBe("Some detailed notes here");
  });

  it("preserves relative order from TickTick Order column within a category", () => {
    // Order values: higher negative = earlier in TickTick's display (they use negative descending)
    const rows = [
      makeRow({ title: "Third", order: "-3" }),
      makeRow({ title: "First", order: "-1" }),
      makeRow({ title: "Second", order: "-2" }),
    ].join("\n");
    const backup = parseTickTickCSV(METADATA + rows);

    expect(backup.tasks).toHaveLength(3);

    const tasksByToken = [...backup.tasks].sort((a, b) =>
      a.orderToken.localeCompare(b.orderToken),
    );
    // Sorted ascending by Order (-3, -2, -1) → Third, Second, First
    expect(tasksByToken[0]!.title).toBe("Third");
    expect(tasksByToken[1]!.title).toBe("Second");
    expect(tasksByToken[2]!.title).toBe("First");
  });

  it("creates a daily list and projection for tasks with a due date", () => {
    const rows = [
      makeRow({
        title: "Scheduled task",
        status: "0",
        dueDate: "2024-06-15T09:00:00+0000",
      }),
      makeRow({ title: "No due date task", status: "0" }),
    ].join("\n");
    const backup = parseTickTickCSV(METADATA + rows);

    expect(backup.tasks).toHaveLength(2);
    expect(backup.dailyLists).toHaveLength(1);
    expect(backup.dailyListProjections).toHaveLength(1);

    const scheduledTask = backup.tasks.find(
      (t) => t.title === "Scheduled task",
    )!;
    const projection = backup.dailyListProjections![0]!;
    const dailyList = backup.dailyLists[0]!;

    // projection.id = taskId in new format
    expect(projection.id).toBe(scheduledTask.id);
    expect(projection.listId).toBe(dailyList.id);
    expect(projection.orderToken).toBeTruthy();
  });

  it("falls back to start date if due date is absent", () => {
    const row = makeRow({
      title: "Start-only",
      status: "0",
      startDate: "2024-07-20T00:00:00+0000",
    });
    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.dailyLists).toHaveLength(1);
    expect(backup.dailyListProjections).toHaveLength(1);
  });

  it("deduplicates daily lists when multiple tasks share the same due date", () => {
    const rows = [
      makeRow({ title: "Task A", dueDate: "2024-06-15T09:00:00+0000" }),
      makeRow({ title: "Task B", dueDate: "2024-06-15T14:00:00+0000" }),
      makeRow({ title: "Task C", dueDate: "2024-06-16T09:00:00+0000" }),
    ].join("\n");
    const backup = parseTickTickCSV(METADATA + rows);

    expect(backup.dailyLists).toHaveLength(2);
    expect(backup.dailyListProjections).toHaveLength(3);
  });

  it("does not create a projection for recurring active tasks", () => {
    const row = makeRow({
      title: "Recurring",
      repeat: "FREQ=DAILY;INTERVAL=1",
      status: "0",
      dueDate: "2024-06-15T09:00:00+0000",
    });
    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.taskTemplates).toHaveLength(1);
    expect(backup.dailyLists).toHaveLength(0);
    expect(backup.dailyListProjections).toHaveLength(0);
  });

  it("handles quoted fields with commas and newlines in task title/content", () => {
    // Build a row with a title containing a comma and content with a newline
    const titleWithComma = "Buy milk, eggs, bread";
    const contentWithNewline = "line1\nline2";
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

    // Construct a 24-col row manually for precise control
    const row =
      [
        q("Folder"),
        q("List"),
        q(titleWithComma),
        q("TEXT"),
        q(""),
        q(contentWithNewline),
        q("N"),
        q(""),
        q(""),
        q(""),
        q(""),
        q("0"),
        q("0"),
        q("2024-01-01T00:00:00+0000"),
        q(""),
        q("0"),
        q("UTC"),
        q("false"),
        q("false"),
        q(""),
        q("0"),
        q("list"),
        q("1"),
        q(""),
      ].join(",") + "\n";

    const backup = parseTickTickCSV(METADATA + row);

    expect(backup.tasks).toHaveLength(1);
    expect(backup.tasks[0]!.title).toBe(titleWithComma);
    expect(backup.tasks[0]!.content).toBe(contentWithNewline);
  });
});
