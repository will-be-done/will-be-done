import { generateNKeysBetween } from "fractional-indexing-jittered";
import { type Backup } from "@will-be-done/slices/space";

/**
 * Generate a test backup with configurable counts.
 *
 * @param projects  Number of projects (an Inbox project is always prepended)
 * @param sections  Number of sections per project
 * @param doneTasks  Number of done tasks per section
 * @param todoTasks  Number of todo tasks per section
 */
export function generateTestBackup(
  projects: number,
  sections: number,
  doneTasks: number,
  todoTasks: number,
): Backup {
  const base = Date.now();

  // Pre-generate enough ordering keys
  const totalProjects = projects + 1; // +1 for inbox
  const totalSections = totalProjects * sections;
  const tasksPerSection = doneTasks + todoTasks;
  const maxKeys = Math.max(totalProjects, totalSections, tasksPerSection, 1);
  const K = generateNKeysBetween(null, null, maxKeys);

  const backupProjects: Backup["projects"] = [];
  const backupSections: Backup["projectSections"] = [];
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

  // Generate ordering keys for sections and tasks within each scope
  const sectionKeys =
    sections > 0 ? generateNKeysBetween(null, null, sections) : [];
  const taskKeys =
    tasksPerSection > 0
      ? generateNKeysBetween(null, null, tasksPerSection)
      : [];

  // Add inbox sections + tasks
  for (let c = 0; c < sections; c++) {
    const sectionId = `c-test-inbox-${c}`;
    backupSections.push({
      id: sectionId,
      title: `Inbox Section ${c + 1}`,
      projectId: inboxId,
      orderToken: sectionKeys[c],
      createdAt: base - 900_000,
    });
    pushTasks(sectionId, `inbox-${c}`, base);
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

    for (let c = 0; c < sections; c++) {
      const sectionId = `c-test-${p}-${c}`;
      backupSections.push({
        id: sectionId,
        title: `Section ${c + 1}`,
        projectId,
        orderToken: sectionKeys[c],
        createdAt: base - 700_000 + p * 100 + c,
      });
      pushTasks(sectionId, `${p}-${c}`, base);
    }
  }

  function pushTasks(sectionId: string, prefix: string, now: number) {
    let idx = 0;
    for (let d = 0; d < doneTasks; d++, idx++) {
      backupTasks.push({
        id: `tk-test-${prefix}-done-${d}`,
        title: `Done task ${d + 1}`,
        state: "done",
        projectSectionId: sectionId,
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
        projectSectionId: sectionId,
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
    projectSections: backupSections,
    tasks: backupTasks,
    taskTemplates: [],
    dailyLists: [],
    dailyListProjections: [],
  };
}
