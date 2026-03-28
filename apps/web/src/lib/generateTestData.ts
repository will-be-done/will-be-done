import { generateNKeysBetween } from "fractional-indexing-jittered";
import { type Backup } from "@will-be-done/slices/space";

/**
 * Generate a test backup with configurable counts.
 *
 * @param projects  Number of projects (an Inbox project is always prepended)
 * @param categories  Number of categories per project
 * @param doneTasks  Number of done tasks per category
 * @param todoTasks  Number of todo tasks per category
 */
export function generateTestBackup(
  projects: number,
  categories: number,
  doneTasks: number,
  todoTasks: number,
): Backup {
  const base = Date.now();

  // Pre-generate enough ordering keys
  const totalProjects = projects + 1; // +1 for inbox
  const totalCategories = totalProjects * categories;
  const tasksPerCat = doneTasks + todoTasks;
  const maxKeys = Math.max(totalProjects, totalCategories, tasksPerCat, 1);
  const K = generateNKeysBetween(null, null, maxKeys);

  const backupProjects: Backup["projects"] = [];
  const backupCategories: Backup["projectCategories"] = [];
  const backupTasks: Backup["tasks"] = [];

  // Inbox project
  const inboxId = "p-test-inbox";
  backupProjects.push({
    id: inboxId,
    title: "Inbox",
    icon: "📥",
    isInbox: true,
    orderToken: K[0],
    createdAt: base - 1_000_000,
  });

  // Generate ordering keys for categories and tasks within each scope
  const catKeys =
    categories > 0 ? generateNKeysBetween(null, null, categories) : [];
  const taskKeys =
    tasksPerCat > 0 ? generateNKeysBetween(null, null, tasksPerCat) : [];

  // Add inbox categories + tasks
  for (let c = 0; c < categories; c++) {
    const catId = `c-test-inbox-${c}`;
    backupCategories.push({
      id: catId,
      title: `Inbox Category ${c + 1}`,
      projectId: inboxId,
      orderToken: catKeys[c],
      createdAt: base - 900_000,
    });
    pushTasks(catId, `inbox-${c}`, base);
  }

  // Regular projects
  for (let p = 0; p < projects; p++) {
    const projectId = `p-test-${p}`;
    backupProjects.push({
      id: projectId,
      title: `Project ${p + 1}`,
      icon: "",
      isInbox: false,
      orderToken: K[p + 1],
      createdAt: base - 800_000 + p,
    });

    for (let c = 0; c < categories; c++) {
      const catId = `c-test-${p}-${c}`;
      backupCategories.push({
        id: catId,
        title: `Category ${c + 1}`,
        projectId,
        orderToken: catKeys[c],
        createdAt: base - 700_000 + p * 100 + c,
      });
      pushTasks(catId, `${p}-${c}`, base);
    }
  }

  function pushTasks(catId: string, prefix: string, now: number) {
    let idx = 0;
    for (let d = 0; d < doneTasks; d++, idx++) {
      backupTasks.push({
        id: `tk-test-${prefix}-done-${d}`,
        title: `Done task ${d + 1}`,
        state: "done",
        projectCategoryId: catId,
        orderToken: taskKeys[idx],
        lastToggledAt: now - 50_000 + d,
        createdAt: now - 600_000 + idx,
        templateId: null,
        templateDate: null,
        content: "",
      });
    }
    for (let t = 0; t < todoTasks; t++, idx++) {
      backupTasks.push({
        id: `tk-test-${prefix}-todo-${t}`,
        title: `Todo task ${t + 1}`,
        state: "todo",
        projectCategoryId: catId,
        orderToken: taskKeys[idx],
        lastToggledAt: 0,
        createdAt: now - 600_000 + idx,
        templateId: null,
        templateDate: null,
        content: "",
      });
    }
  }

  return {
    projects: backupProjects,
    projectCategories: backupCategories,
    tasks: backupTasks,
    taskTemplates: [],
    dailyLists: [],
    dailyListProjections: [],
  };
}
