import { describe, expect, it } from "vitest";
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
