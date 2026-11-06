import { describe, expect, it } from "vitest";
import { DB, execSync, selectSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  loadSpaceBackup,
  mindmapTree,
  type MindmapTreeNode,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { generateDemoBackup } from "./demoData";

describe("generateDemoBackup", () => {
  it("includes timed tasks with durations for the calendar", () => {
    const backup = generateDemoBackup();
    const tasksById = new Map(backup.tasks.map((task) => [task.id, task]));
    const timedEntries = (backup.dailyEntries ?? []).filter(
      (entry) => entry.time !== undefined,
    );

    expect(timedEntries.length).toBeGreaterThan(0);
    expect(
      timedEntries.every(
        (entry) => tasksById.get(entry.taskId ?? "")?.durationMinutes != null,
      ),
    ).toBe(true);

    expect(timedEntries.find((entry) => entry.taskId === "tk-be-1")?.time).toBe(
      "09:00",
    );
    expect(tasksById.get("tk-be-1")?.durationMinutes).toBe(120);
    expect(timedEntries.find((entry) => entry.taskId === "tk-dc-2")?.time).toBe(
      "09:30",
    );
  });
});

describe("demo mindmaps", () => {
  it("load with every node shown, linking tasks and notes that exist", () => {
    const backup = generateDemoBackup();
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(db.loadTables(registeredSpaceSyncableTables));
    syncDispatch(db, loadSpaceBackup({ backup }));

    const shown = (trees: MindmapTreeNode[]): number =>
      trees.reduce((sum, tree) => sum + 1 + shown(tree.children), 0);
    expect(backup.mindmaps?.length).toBeGreaterThan(0);
    for (const map of backup.mindmaps ?? []) {
      const tree = selectSync(db, {
        selector: mindmapTree,
        args: { mindmapId: map.id },
      })!;
      // A node whose task or note is missing would be hidden.
      expect(shown([...tree.branches, ...tree.floating])).toBe(
        (backup.mindmapNodes ?? []).filter(
          (node) => node.mindmapId === map.id && node.id !== map.id,
        ).length,
      );
      expect(tree.root.title).toBe(map.title);
    }
  });
});
