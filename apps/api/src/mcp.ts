import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { syncDispatch, select } from "@will-be-done/hyperdb";
import { authSlice } from "./slices/authSlice";
import type { User } from "./slices/authSlice";
import { dbSlice } from "./slices/dbSlice";
import { getMainHyperDB, getHyperDB } from "./db/db";
import { spaceDBConfig, userDBConfig } from "./db/configs";
import { subscriptionManager } from "./subscriptionManager";
import { spaceSlice } from "@will-be-done/slices/user";
import {
  projectsSlice,
  projectCategoriesSlice,
  projectCategoryCardsSlice,
  cardsTasksSlice,
  dailyListsSlice,
  dailyListsProjectionsSlice,
  getDMY,
} from "@will-be-done/slices/space";

const mainDB = getMainHyperDB();

const getSpaceDB = (spaceId: string, user: User) => {
  syncDispatch(mainDB, dbSlice.getByIdOrCreate(spaceId, "space", user.id));
  const config = spaceDBConfig(spaceId);
  const { db } = getHyperDB(config);
  return db;
};

const buildMcpServer = (user: User): McpServer => {
  const server = new McpServer(
    { name: "will-be-done-mcp", version: "1.0.0" },
    {
      instructions:
        "Task management app. Start with list_spaces to discover available spaces, then list_projects to see projects, then list_tasks_in_project or list_tasks_for_date_range to explore tasks.",
    },
  );

  server.registerTool(
    "list_spaces",
    {
      description:
        "List all spaces (workspaces) the user has access to. Call this first to get space IDs needed by other tools.",
      inputSchema: {},
    },
    async () => {
      try {
        const { db } = getHyperDB(userDBConfig(user.id));
        const spaces = select(db, spaceSlice.listSpaces());
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                spaces.map((s) => ({ id: s.id, name: s.name })),
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "List all projects in a space.",
      inputSchema: {
        spaceId: z.string().describe("The space ID (from list_spaces)"),
      },
    },
    async ({ spaceId }) => {
      try {
        const db = getSpaceDB(spaceId, user);
        const projectIds = select(db, projectsSlice.allIds());
        const projects = projectIds
          .map((id) => select(db, projectsSlice.byId(id)))
          .filter(Boolean)
          .map((p) => ({
            id: p!.id,
            title: p!.title,
            icon: p!.icon,
            isInbox: p!.isInbox,
          }));
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(projects, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "list_tasks_in_project",
    {
      description: "List tasks in a project, organized by category.",
      inputSchema: {
        spaceId: z.string().describe("The space ID (from list_spaces)"),
        projectId: z.string().describe("The project ID (from list_projects)"),
        state: z
          .enum(["todo", "done", "all"])
          .optional()
          .default("todo")
          .describe("Filter by task state (default: todo)"),
      },
    },
    async ({ spaceId, projectId, state }) => {
      try {
        const db = getSpaceDB(spaceId, user);
        const project = select(db, projectsSlice.byId(projectId));
        if (!project) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: Project not found: ${projectId}`,
              },
            ],
          };
        }

        const categories = select(
          db,
          projectCategoriesSlice.byProjectId(projectId),
        );
        const result: Array<{
          categoryId: string;
          category: string;
          tasks: unknown[];
        }> = [];

        for (const category of categories) {
          const tasks: unknown[] = [];

          if (state === "todo" || state === "all") {
            const todoIds = select(
              db,
              projectCategoryCardsSlice.childrenIds(category.id),
            );
            for (const id of todoIds) {
              const task = select(db, cardsTasksSlice.byId(id));
              if (task) {
                tasks.push({
                  id: task.id,
                  title: task.title,
                  state: task.state,
                  horizon: task.horizon,
                });
              }
            }
          }

          if (state === "done" || state === "all") {
            const doneIds = select(
              db,
              projectCategoryCardsSlice.doneChildrenIds(category.id),
            );
            for (const id of doneIds) {
              const task = select(db, cardsTasksSlice.byId(id));
              if (task) {
                tasks.push({
                  id: task.id,
                  title: task.title,
                  state: task.state,
                  horizon: task.horizon,
                });
              }
            }
          }

          result.push({
            categoryId: category.id,
            category: category.title,
            tasks,
          });
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "create_task",
    {
      description:
        "Create a new task in a project. Returns the created task details.",
      inputSchema: {
        spaceId: z.string().describe("The space ID (from list_spaces)"),
        projectId: z.string().describe("The project ID (from list_projects)"),
        title: z.string().describe("The task title"),
        categoryId: z
          .string()
          .optional()
          .describe(
            "Optional category ID. If not provided, uses the first category.",
          ),
        horizon: z
          .enum(["week", "month", "year", "someday"])
          .optional()
          .describe("Task horizon/timeframe (default: week)"),
      },
    },
    async ({ spaceId, projectId, title, categoryId, horizon }) => {
      try {
        const db = getSpaceDB(spaceId, user);
        const project = select(db, projectsSlice.byId(projectId));
        if (!project) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Error: Project not found: ${projectId}`,
              },
            ],
          };
        }

        if (categoryId) {
          const category = select(
            db,
            projectCategoriesSlice.byId(categoryId),
          );
          if (!category || category.projectId !== projectId) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: "Error: Category not found in project",
                },
              ],
            };
          }
        }

        const task = syncDispatch(
          db,
          projectsSlice.createTask(projectId, "append", {
            title,
            ...(horizon ? { horizon } : {}),
            ...(categoryId ? { projectCategoryId: categoryId } : {}),
          }),
        );

        subscriptionManager.notifyChangesAvailable(spaceId, "space");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: task.id,
                  title: task.title,
                  state: task.state,
                  horizon: task.horizon,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "list_tasks_for_date_range",
    {
      description:
        "List tasks scheduled in the daily list for a specific date range. Returns tasks grouped by date.",
      inputSchema: {
        spaceId: z.string().describe("The space ID (from list_spaces)"),
        startDate: z
          .string()
          .describe("Start date in YYYY-MM-DD format (inclusive)"),
        endDate: z
          .string()
          .describe("End date in YYYY-MM-DD format (inclusive)"),
      },
    },
    async ({ spaceId, startDate, endDate }) => {
      try {
        const db = getSpaceDB(spaceId, user);
        const start = new Date(startDate + "T00:00:00Z");
        const end = new Date(endDate + "T00:00:00Z");

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Error: Invalid date format. Use YYYY-MM-DD.",
              },
            ],
          };
        }

        if (start > end) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Error: startDate must be before or equal to endDate",
              },
            ],
          };
        }

        const diffDays = Math.round(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 365) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Error: Date range cannot exceed 365 days",
              },
            ],
          };
        }

        const result: Array<{ date: string; tasks: unknown[] }> = [];
        const current = new Date(start);

        while (current <= end) {
          const dateStr = getDMY(current);
          const dailyList = select(db, dailyListsSlice.byDate(dateStr));

          if (!dailyList) {
            result.push({ date: dateStr, tasks: [] });
          } else {
            const taskIds = select(
              db,
              dailyListsProjectionsSlice.childrenIds(dailyList.id),
            );
            const tasks: unknown[] = [];
            for (const id of taskIds) {
              const task = select(db, cardsTasksSlice.byId(id));
              if (task) {
                tasks.push({
                  id: task.id,
                  title: task.title,
                  state: task.state,
                  horizon: task.horizon,
                });
              }
            }
            result.push({ date: dateStr, tasks });
          }

          current.setUTCDate(current.getUTCDate() + 1);
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  return server;
};

export const mcpPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.post("/mcp", async (req, reply) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;

    if (!token) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = syncDispatch(mainDB, authSlice.validateToken(token));
    if (!user) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    reply.hijack();

    const server = buildMcpServer(user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      await server.close();
    }
  });

  fastify.get("/mcp", async (_req, reply) => {
    return reply.code(405).send({ error: "Method Not Allowed" });
  });

  fastify.delete("/mcp", async (_req, reply) => {
    return reply.code(405).send({ error: "Method Not Allowed" });
  });
};
