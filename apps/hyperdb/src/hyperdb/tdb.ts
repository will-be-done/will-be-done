import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  createCollection,
  createLiveQueryCollection,
  eq,
  liveQueryCollectionOptions,
  parseLoadSubsetOptions,
} from "@tanstack/db";
import { QueryClient } from "@tanstack/query-core";
import { z } from "zod";

const queryClient = new QueryClient();

const todoSchema = z.object({
  id: z.string(),
  text: z.string().min(1, "Text is required"),
  completed: z.boolean(),
  priority: z.number().min(0).max(5),
});

const todosCollection = createCollection(
  queryCollectionOptions({
    schema: todoSchema,
    id: "todo",
    queryKey: ["todos"],
    queryClient,
    getKey: (item) => item.id,
    syncMode: "on-demand", // Enable predicate push-down

    queryFn: async (ctx) => {
      if (!ctx.meta) return [];
      if (!ctx.meta.loadSubsetOptions) return [];

      const { limit, offset, where, orderBy } = ctx.meta.loadSubsetOptions;

      // Parse the expressions into simple format
      const parsed = parseLoadSubsetOptions({ where, orderBy, limit });

      // Build query parameters from parsed filters
      const params = new URLSearchParams();

      // Add filters
      parsed.filters.forEach(({ field, operator, value }) => {
        const fieldName = field.join(".");
        if (operator === "eq") {
          params.set(fieldName, String(value));
        } else if (operator === "lt") {
          params.set(`${fieldName}_lt`, String(value));
        } else if (operator === "gt") {
          params.set(`${fieldName}_gt`, String(value));
        }
      });

      // Add sorting
      if (parsed.sorts.length > 0) {
        const sortParam = parsed.sorts
          .map((s) => `${s.field.join(".")}:${s.direction}`)
          .join(",");
        params.set("sort", sortParam);
      }

      // Add limit
      if (parsed.limit) {
        params.set("limit", String(parsed.limit));
      }

      // Add offset for pagination
      if (offset) {
        params.set("offset", String(offset));
      }

      const response = await fetch(`/api/products?${params}`);
      return response.json();
    },
  }),
);

const activeTodos = createLiveQueryCollection((q) =>
  q
    .from({ todo: todosCollection })
    .where(({ todo }) => eq(todo.completed, false)),
);

// It means:
// 1. No isolation in transactions. Or transactions should be write only(maybe ok?)
// 2. Ig just useQuery - you will need to define selectos logic in react components. While with hyperdb appraoch everything defined in just one selector
