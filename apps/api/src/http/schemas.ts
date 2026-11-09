import { z } from "zod";
import {
  isProjectBackgroundImageUrl,
  isValidTaskTemplateRule,
  maxTaskDurationMinutes,
  taskTimePattern,
} from "@will-be-done/slices/space";

const RepeatRuleSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTaskTemplateRule, "Invalid RFC 5545 recurrence rule")
  .describe("RFC 5545 recurrence rule");

const TaskTimeSchema = z
  .string()
  .regex(taskTimePattern, "Expected a 24-hour time in HH:mm format")
  .describe(
    "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
  );

const DurationMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(maxTaskDurationMinutes)
  .describe("Estimated duration in whole minutes");

export const ErrorResponseSchema = z
  .object({
    code: z.enum([
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "INTERNAL_SERVER_ERROR",
    ]),
    message: z.string(),
  })
  .describe("Error response");

export const PlacementSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("first") }).strict(),
    z.object({ kind: z.literal("last") }).strict(),
    z
      .object({
        kind: z.literal("before"),
        anchorId: z
          .string()
          .min(1)
          .describe("Sibling to place the entity before"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("after"),
        anchorId: z
          .string()
          .min(1)
          .describe("Sibling to place the entity after"),
      })
      .strict(),
  ])
  .describe("Position within an ordered collection");

const ProjectBackgroundImageUrlSchema = z
  .string()
  .trim()
  .refine(
    isProjectBackgroundImageUrl,
    "Choose a photo or enter a valid HTTP or HTTPS image URL",
  )
  .describe(
    "HTTP or HTTPS image URL, or a base64 JPEG data URL up to 256 KiB; null clears the background",
  )
  .nullable()
  .optional();

const ProjectColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable()
  .optional();

export const ProjectSchema = z.object({
  id: z.string().describe("Project identifier"),
  title: z.string(),
  icon: z.string(),
  backgroundImageUrl: ProjectBackgroundImageUrlSchema,
  cardBackgroundColor: ProjectColorSchema,
  accentColor: ProjectColorSchema,
  isInbox: z.boolean(),
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .describe("Creation time as Unix milliseconds"),
});

export const ListProjectsParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
});

export const ListProjectsResponseSchema = z
  .object({
    projects: z.array(ProjectSchema),
  })
  .describe("Projects in display order");

export const ProjectParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  projectId: z.string().min(1).describe("Project identifier"),
});

export const CreateProjectBodySchema = z
  .object({
    title: z.string().trim().min(1),
    icon: z.string().optional(),
    backgroundImageUrl: ProjectBackgroundImageUrlSchema,
    cardBackgroundColor: ProjectColorSchema,
    accentColor: ProjectColorSchema,
    placement: PlacementSchema.optional(),
  })
  .strict();

export const ProjectResponseSchema = z
  .object({ project: ProjectSchema })
  .describe("Project details");

export const UpdateProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    icon: z.string().optional(),
    backgroundImageUrl: ProjectBackgroundImageUrlSchema,
    cardBackgroundColor: ProjectColorSchema,
    accentColor: ProjectColorSchema,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveProjectBodySchema = z
  .object({ placement: PlacementSchema })
  .strict();

export const SpaceSchema = z.object({
  id: z.string().describe("Space identifier"),
  name: z.string(),
  createdAt: z.string().datetime().describe("Creation time in ISO 8601 format"),
  updatedAt: z.string().datetime().describe("Update time in ISO 8601 format"),
});

export const ListSpacesResponseSchema = z
  .object({
    spaces: z.array(SpaceSchema),
  })
  .describe("Spaces belonging to the authenticated user");

export const CreateSpaceBodySchema = z.object({
  name: z.string().trim().min(1).describe("Space name"),
});

export const CreateSpaceResponseSchema = z.object({
  space: SpaceSchema,
});

export const SpaceParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
});

export const DeleteSpaceParamsSchema = SpaceParamsSchema;

export const UpdateSpaceBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const SpaceResponseSchema = z
  .object({ space: SpaceSchema })
  .describe("Space details");

export const ProjectSectionsParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  projectId: z.string().min(1).describe("Project identifier"),
});

export const ProjectSectionSchema = z.object({
  id: z.string().describe("Project section identifier"),
  projectId: z.string().describe("Parent project identifier"),
  title: z.string(),
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .describe("Creation time as Unix milliseconds"),
});

export const ListProjectSectionsResponseSchema = z.object({
  sections: z.array(ProjectSectionSchema),
});

export const SectionParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  sectionId: z.string().min(1).describe("Project section identifier"),
});

export const CreateProjectSectionBodySchema = z
  .object({
    title: z.string().trim().min(1),
    placement: PlacementSchema.optional(),
  })
  .strict();

export const ProjectSectionResponseSchema = z
  .object({
    section: ProjectSectionSchema,
  })
  .describe("Project section details");

export const UpdateProjectSectionBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveProjectSectionBodySchema = z
  .object({
    projectId: z.string().min(1),
    placement: PlacementSchema,
  })
  .strict();

export const SectionTasksParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  sectionId: z.string().min(1).describe("Project section identifier"),
});

export const TaskParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  taskId: z.string().min(1).describe("Task identifier"),
});

export const StashTaskParamsSchema = TaskParamsSchema;

export const TaskStateSchema = z.enum(["todo", "done"]);
export const TaskNatureSchema = z.enum(["red", "green", "unknown"]);

export const TaskSchema = z.object({
  type: z.literal("task"),
  id: z.string().describe("Task identifier"),
  title: z.string(),
  content: z.string().optional(),
  state: TaskStateSchema,
  projectSectionId: z.string().describe("Parent project section identifier"),
  nature: TaskNatureSchema,
  createdAt: z
    .number()
    .int()
    .nonnegative()
    .describe("Creation time as Unix milliseconds"),
  lastToggledAt: z
    .number()
    .int()
    .nonnegative()
    .describe("Last state change time as Unix milliseconds"),
  scheduledDate: z.iso
    .date()
    .nullable()
    .describe("Current schedule date, or null when the task is unscheduled"),
  scheduledTime: TaskTimeSchema.nullable().describe(
    "Time on the schedule date in HH:mm, or null when the task has no time",
  ),
  durationMinutes: DurationMinutesSchema.nullable(),
});

export const TaskTemplateSchema = z.object({
  type: z.literal("template"),
  id: z.string().describe("Task template identifier"),
  title: z.string(),
  content: z.string().optional(),
  projectSectionId: z.string().describe("Parent project section identifier"),
  nature: TaskNatureSchema,
  repeatRule: z.string(),
  repeatRuleDtStart: z.number().int().nonnegative(),
  time: TaskTimeSchema.nullable().describe(
    "Time given to generated tasks for daily or coarser rules",
  ),
  durationMinutes: DurationMinutesSchema.nullable(),
  createdAt: z.number().int().nonnegative(),
  lastGeneratedAt: z.number().int().nonnegative(),
});

export const TaskTemplateParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  templateId: z.string().min(1).describe("Task template identifier"),
});

export const CreateTaskTemplateBodySchema = z
  .object({
    title: z.string().trim().min(1),
    content: z.string().nullable().optional(),
    nature: TaskNatureSchema.nullable().optional(),
    repeatRule: RepeatRuleSchema.optional(),
    repeatRuleDtStart: z.number().int().nonnegative().optional(),
    time: TaskTimeSchema.nullable().optional(),
    durationMinutes: DurationMinutesSchema.nullable().optional(),
    placement: PlacementSchema.optional(),
  })
  .strict();

export const UpdateTaskTemplateBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().nullable().optional(),
    nature: TaskNatureSchema.nullable().optional(),
    repeatRule: RepeatRuleSchema.optional(),
    repeatRuleDtStart: z.number().int().nonnegative().optional(),
    time: TaskTimeSchema.nullable().optional(),
    durationMinutes: DurationMinutesSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const ConvertTaskToTemplateBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().nullable().optional(),
    nature: TaskNatureSchema.nullable().optional(),
    repeatRule: RepeatRuleSchema.optional(),
    repeatRuleDtStart: z.number().int().nonnegative().optional(),
    time: TaskTimeSchema.nullable().optional(),
    durationMinutes: DurationMinutesSchema.nullable().optional(),
  })
  .strict();

export const MoveTaskTemplateBodySchema = z
  .object({
    projectSectionId: z.string().min(1),
    placement: PlacementSchema,
  })
  .strict();

export const TaskTemplateResponseSchema = z.object({
  template: TaskTemplateSchema,
});

export const NoteSchema = z.object({
  type: z.literal("note"),
  id: z.string().describe("Note identifier"),
  title: z.string(),
  content: z.string().optional(),
  projectSectionId: z.string().describe("Parent project section identifier"),
  createdAt: z.number().int().nonnegative(),
});

export const NoteParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  noteId: z.string().min(1).describe("Note identifier"),
});

export const UpdateNoteBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveNoteBodySchema = z
  .object({
    projectSectionId: z.string().min(1),
    placement: PlacementSchema,
  })
  .strict();

export const NoteResponseSchema = z.object({
  note: NoteSchema,
});

export const ItemSchema = z.discriminatedUnion("type", [
  TaskSchema,
  TaskTemplateSchema,
  NoteSchema,
]);

export const ListSectionItemsQuerySchema = z.object({
  taskState: TaskStateSchema.optional().default("todo"),
});

export const ListSectionItemsResponseSchema = z.object({
  items: z.array(ItemSchema),
});

export const CreateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1),
    content: z.string().optional(),
    nature: TaskNatureSchema.optional(),
    durationMinutes: DurationMinutesSchema.optional(),
    placement: PlacementSchema.optional(),
  })
  .strict();

export const CreateStashTaskBodySchema = CreateTaskBodySchema;

export const PutStashTaskBodySchema = z
  .object({
    placement: PlacementSchema.optional(),
  })
  .strict();

export const TaskResponseSchema = z
  .object({ task: TaskSchema })
  .describe("Task details");

export const ListStashTasksQuerySchema = z
  .object({
    state: TaskStateSchema.optional().default("todo"),
  })
  .strict();

export const ListStashTasksResponseSchema = z
  .object({
    tasks: z.array(TaskSchema),
  })
  .describe("Tasks in stash display order");

export const ListSpaceTasksQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const PaginatedTasksResponseSchema = z
  .object({
    tasks: z.array(TaskSchema),
    nextCursor: z.string().nullable(),
  })
  .describe("Page of tasks with an optional continuation cursor");

export const ScheduleTaskBodySchema = z
  .object({
    date: z.iso.date().describe("Schedule date in YYYY-MM-DD format"),
    time: TaskTimeSchema.nullable()
      .optional()
      .describe(
        "Time on the date; omit to keep the current time, null to clear",
      ),
    placement: PlacementSchema.optional(),
  })
  .strict();

export const ScheduleTaskResponseSchema = z.object({
  task: TaskSchema,
  date: z.iso.date(),
});

export const DailyListItemsParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  date: z.iso.date().describe("Daily-list date in YYYY-MM-DD format"),
});

export const DailyListItemsQuerySchema = z.object({
  state: TaskStateSchema.optional().default("todo"),
});

export const DailyListItemsResponseSchema = z.object({
  items: z.array(TaskSchema),
});

export const DailyListsRangeQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    state: TaskStateSchema.optional().default("todo"),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine(({ from, to }) => from <= to, {
    message: "from must be on or before to",
    path: ["to"],
  })
  .refine(
    ({ from, to }) =>
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <=
      30 * 24 * 60 * 60 * 1000,
    {
      message: "Date range cannot exceed 30 days",
      path: ["to"],
    },
  );

export const DailyListSchema = z.object({
  date: z.iso.date(),
  items: z.array(TaskSchema),
});

export const DailyListsRangeResponseSchema = z
  .object({
    dailyLists: z.array(DailyListSchema),
    nextCursor: z.string().nullable(),
  })
  .describe(
    "Page of daily lists in ascending date order with an optional continuation cursor",
  );

export const ScheduledTasksQuerySchema = z
  .object({
    scope: z.enum(["overdue", "upcoming"]),
    relativeTo: z.iso
      .date()
      .optional()
      .describe("Boundary date; defaults to today"),
    to: z.iso
      .date()
      .optional()
      .describe("Inclusive end date for upcoming tasks"),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine(({ scope, to }) => scope === "upcoming" || to === undefined, {
    message: "to is only supported for upcoming tasks",
    path: ["to"],
  })
  .refine(({ relativeTo, to }) => !relativeTo || !to || relativeTo <= to, {
    message: "relativeTo must be on or before to",
    path: ["to"],
  });

export const UpdateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().nullable().optional(),
    state: TaskStateSchema.optional(),
    nature: TaskNatureSchema.nullable().optional(),
    scheduledTime: TaskTimeSchema.nullable()
      .optional()
      .describe(
        "Time on the current schedule date; the task must be scheduled",
      ),
    durationMinutes: DurationMinutesSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveTaskBodySchema = z
  .object({
    projectSectionId: z.string().min(1),
    placement: PlacementSchema,
  })
  .strict();

export const ChecklistParentTypeSchema = z.enum(["task", "template"]);

export const TaskChecklistParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  taskId: z.string().min(1).describe("Task identifier"),
});

export const TaskTemplateChecklistParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  templateId: z.string().min(1).describe("Task template identifier"),
});

export const ChecklistItemParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  checklistItemId: z.string().min(1).describe("Checklist item identifier"),
});

export const ChecklistItemSchema = z.object({
  type: z.literal("checklistItem"),
  id: z.string().describe("Checklist item identifier"),
  parentId: z.string().describe("Task or task-template identifier"),
  parentType: ChecklistParentTypeSchema,
  state: TaskStateSchema,
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  checkedAt: z.number().int().nonnegative().nullable(),
});

export const ChecklistItemsResponseSchema = z.object({
  checklistItems: z.array(ChecklistItemSchema),
});

export const ChecklistItemResponseSchema = z.object({
  checklistItem: ChecklistItemSchema,
});

export const CreateChecklistItemBodySchema = z
  .object({
    content: z.string().trim().min(1),
    state: TaskStateSchema.optional(),
    placement: PlacementSchema.optional(),
  })
  .strict();

export const UpdateChecklistItemBodySchema = z
  .object({
    content: z.string().trim().min(1).optional(),
    state: TaskStateSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveChecklistItemBodySchema = z
  .object({
    parentId: z.string().min(1),
    parentType: ChecklistParentTypeSchema,
    placement: PlacementSchema,
  })
  .strict();

export const MindmapParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  mindmapId: z.string().min(1).describe("Mindmap identifier"),
});

export const MindmapNodeParamsSchema = z.object({
  spaceId: z.string().min(1).describe("Space identifier"),
  nodeId: z.string().min(1).describe("Mindmap node identifier"),
});

const MindmapNodeSideSchema = z
  .enum(["left", "right"])
  .describe("Side of its root a main branch sits on");

const MindmapPointSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict()
  .describe(
    "A floating root's center, in map units; the central topic sits at 0, 0",
  );

export const MindmapSchema = z.object({
  type: z.literal("mindmap"),
  id: z.string().describe("Mindmap identifier"),
  title: z
    .string()
    .describe(
      "Name, plain text. Apps show the central topic's text while it is empty",
    ),
  createdAt: z.number().int().nonnegative(),
});

export const MindmapNodeSchema = z.object({
  type: z.literal("mindmapNode"),
  id: z.string().describe("Mindmap node identifier"),
  mindmapId: z.string(),
  parentId: z
    .string()
    .nullable()
    .describe(
      "Parent node, or null for a root: the central topic, whose ID is the mindmap's, or a floating topic",
    ),
  kind: z
    .enum(["topic", "task", "note"])
    .describe("A topic owns its title; a task or note node shows that item"),
  taskId: z.string().nullable(),
  noteId: z.string().nullable(),
  title: z.string().describe("Topic text, or the task's or note's title"),
  side: MindmapNodeSideSchema,
  position: MindmapPointSchema.nullable().describe(
    "Set on floating topics only",
  ),
  collapsed: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const MindmapsResponseSchema = z.object({
  mindmaps: z.array(MindmapSchema),
});

export const MindmapResponseSchema = z.object({
  mindmap: MindmapSchema,
});

export const MindmapWithNodesResponseSchema = z.object({
  mindmap: MindmapSchema,
  nodes: z
    .array(MindmapNodeSchema)
    .describe(
      "Depth-first: each parent precedes its children, and siblings are in order",
    ),
});

export const MindmapNodeResponseSchema = z.object({
  node: MindmapNodeSchema,
});

export const CreateMindmapBodySchema = z
  .object({ title: z.string().trim().min(1) })
  .strict();

export const UpdateMindmapBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .describe("Empty clears the name, so apps show the central topic's text"),
  })
  .strict();

export const CreateMindmapNodeBodySchema = z
  .object({
    parentId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Parent node; the central topic (the mindmap ID) or omitted for a main branch",
      ),
    placement: PlacementSchema.optional(),
    position: MindmapPointSchema.optional().describe(
      "Creates a floating topic there instead of placing it under a parent",
    ),
    side: MindmapNodeSideSchema.optional().describe(
      "Side for a main branch placed first or last; defaults to the side with fewer branches",
    ),
    title: z.string().trim().min(1).optional().describe("Creates a topic"),
    taskId: z
      .string()
      .min(1)
      .optional()
      .describe("Adds a node for a task; a task can be on several nodes"),
    noteId: z
      .string()
      .min(1)
      .optional()
      .describe("Adds a node for a note; a note can be on several nodes"),
  })
  .strict()
  .refine(
    (body) =>
      [body.title, body.taskId, body.noteId].filter((v) => v !== undefined)
        .length === 1,
    { message: "Provide exactly one of title, taskId, or noteId" },
  )
  .refine(
    (body) =>
      body.position === undefined ||
      (body.title !== undefined &&
        body.parentId === undefined &&
        body.placement === undefined),
    { message: "A position takes a title and no parentId or placement" },
  );

export const UpdateMindmapNodeBodySchema = z
  .object({
    title: z.string().trim().min(1).optional().describe("Topics only"),
    collapsed: z.boolean().optional(),
    side: MindmapNodeSideSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const MoveMindmapNodeBodySchema = z
  .object({
    parentId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "New parent node; the central topic (the mindmap ID) for a main branch",
      ),
    placement: PlacementSchema.optional().describe("Defaults to last"),
    position: MindmapPointSchema.optional().describe(
      "Floats the topic there, out of its parent",
    ),
    side: MindmapNodeSideSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      (body.position === undefined) !== (body.parentId === undefined) &&
      (body.position === undefined || body.placement === undefined),
    { message: "Provide a parentId (and placement) or a position" },
  );
