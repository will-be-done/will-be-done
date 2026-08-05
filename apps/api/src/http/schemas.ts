import { z } from "zod";
import { isValidTaskTemplateRule } from "@will-be-done/slices/space";

const RepeatRuleSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTaskTemplateRule, "Invalid RFC 5545 recurrence rule")
  .describe("RFC 5545 recurrence rule");

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

export const ProjectSchema = z.object({
  id: z.string().describe("Project identifier"),
  title: z.string(),
  icon: z.string(),
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

export const ItemSchema = z.discriminatedUnion("type", [
  TaskSchema,
  TaskTemplateSchema,
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
