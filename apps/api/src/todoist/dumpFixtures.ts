/**
 * Run with: bun apps/api/src/todoist/dumpFixtures.ts <TODOIST_API_TOKEN>
 *
 * Dumps raw Todoist API responses to apps/api/src/todoist/fixtures/*.json
 * so they can be used as test mocks.
 */
import { TodoistApi } from "@doist/todoist-api-typescript";
import fs from "fs";
import path from "path";

const token = process.argv[2];
if (!token) {
  console.error("Usage: bun apps/api/src/todoist/dumpFixtures.ts <API_TOKEN>");
  process.exit(1);
}

const api = new TodoistApi(token);
const outDir = path.join(__dirname, "fixtures");
fs.mkdirSync(outDir, { recursive: true });

function write(name: string, data: unknown) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`Wrote ${file}`);
}

async function paginate<T>(
  label: string,
  fn: (cursor?: string | null) => Promise<{ results?: T[]; items?: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null | undefined = undefined;
  let page = 0;
  do {
    const res = await fn(cursor);
    const batch = res.results ?? res.items ?? [];
    all.push(...batch);
    cursor = res.nextCursor;
    page++;
    console.log(`  ${label} page ${page}: ${batch.length} items (nextCursor: ${cursor ?? "null"})`);
  } while (cursor);
  return all;
}

async function main() {
  console.log("Fetching projects...");
  const projects = await paginate("projects", (cursor) =>
    api.getProjects({ cursor, limit: 200 }),
  );
  write("projects.json", projects);

  console.log("Fetching sections...");
  const sections = await paginate("sections", (cursor) =>
    api.getSections({ cursor, limit: 200 }),
  );
  write("sections.json", sections);

  console.log("Fetching active tasks...");
  const activeTasks = await paginate("activeTasks", (cursor) =>
    api.getTasks({ cursor, limit: 200 }),
  );
  write("activeTasks.json", activeTasks);

  console.log("Fetching completed tasks (in 3-month chunks)...");
  const completedTasks: unknown[] = [];
  try {
    const now = new Date();
    const MONTHS_PER_CHUNK = 3;
    const MAX_YEARS_BACK = 15;
    const totalChunks = (MAX_YEARS_BACK * 12) / MONTHS_PER_CHUNK;

    for (let i = 0; i < totalChunks; i++) {
      const until = new Date(now);
      until.setMonth(until.getMonth() - i * MONTHS_PER_CHUNK);
      const since = new Date(now);
      since.setMonth(since.getMonth() - (i + 1) * MONTHS_PER_CHUNK);

      const sinceStr = since.toISOString().replace("Z", "");
      const untilStr = until.toISOString().replace("Z", "");
      console.log(`  chunk ${i + 1}: ${sinceStr} → ${untilStr}`);

      const chunk = await paginate(`completedTasks[${i}]`, (cursor) =>
        api.getCompletedTasksByCompletionDate({
          since: sinceStr,
          until: untilStr,
          cursor,
          limit: 200,
        }),
      );
      completedTasks.push(...chunk);
      if (chunk.length === 0 && i > 0) {
        console.log("  (no more completed tasks, stopping)");
        break;
      }
    }
  } catch (e) {
    console.warn(
      "Could not fetch completed tasks (may require Todoist Premium):",
      e instanceof Error ? e.message : e,
    );
  }
  write("completedTasks.json", completedTasks);

  console.log("\nDone! Fixtures written to", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
