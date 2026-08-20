# Agent Notes

# Definitions

- Task: a concrete work item with a title, state, project section, order, and optional template origin.
- TaskNature: the optional color/nature marker for a Task or TaskTemplate: `red`, `green`, or `unknown`.
- TaskTemplate: a repeatable task blueprint that generates Tasks from a recurrence rule.
- Project: a top-level container for organizing project sections; one Project can be the inbox.
- Item: primary content shown in project sections. Currently a Task or TaskTemplate; may include other content such as Note in the future.
- ProjectSection: an ordered section inside a Project that contains Items directly. Tasks and TaskTemplates store their section and section order. Its persisted discriminator is `projectSection`.
- DailyList: a dated schedule list, identified by date, that contains DailyEntries.
- DailyEntry: a scheduled appearance of a Task in a DailyList. It has its own `id`, references the Task through `taskId`, and stores the DailyList and order for that task on that date. Its persisted discriminator is `dailyEntry`.
- Stash: the unscheduled holding area represented by StashEntries. It keeps items quickly accessible from any page.
- StashEntry: an unscheduled appearance of a Task in the stash. It has its own `id`, references the Task through `taskId`, and stores the stash order. Its persisted discriminator is `stashEntry`.
- Entry: a DailyEntry or StashEntry. This is a TypeScript union, not a shared database table.
- ListItem: an Item or Entry that can occupy an ordered view.
- ListItemType: the model type of a ListItem.
- ChecklistItem: an ordered checklist row attached to a Task or TaskTemplate.
- ChecklistParentType: the model types that can own ChecklistItems: Task or TaskTemplate.
- ProjectSectionTaskStats: derived counts of total, todo, and done Tasks for a ProjectSection.
- ScheduledTodoTask: a derived index row for a todo Task scheduled through a DailyEntry.
- SpaceMigration: a record that a space-level migration has been applied.
- Model / AnyModel: a syncable domain object from the space tables.
- ModelType / AnyModelType: a model discriminator used to route domain objects and include the virtual `stash` type.
- Table: a HyperDB table that stores one kind of model or derived record.

# A note from Theo
I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults".

# HyperDB

If you are interacting with HyperDB(@will-be-done/hyperdb), read small guide what is it, and how
to work with it at @.guides/hyperdb.md

# Sync Protocol

Before changing sync clocks, cursors, merge behavior, change hooks, transport, staging,
backup recovery, tombstones, or sync persistence, read and follow @docs/sync.md.

The consistency, recovery, echo-suppression, and idempotency rules in that document are
mandatory invariants. A sync change must update the document and its regression tests when it
changes protocol state or behavior; it must not introduce a path that bypasses those invariants.

# Query Performance

For API handlers, request hooks, and user-triggered actions:

- Keep reads bounded by the requested resource, indexed range, or pagination limit. Request-path
  memory should normally be proportional to the returned page and its related rows, not the total
  table size.
- Do not load all table rows or all IDs and then filter, sort, or paginate in JavaScript when an
  indexed HyperDB selector can express the query. Avoid the `allIds -> rowsByIds -> filter` pattern.
- Potentially growing collection endpoints must use cursor pagination, a bounded range, or a
  clearly bounded parent collection.
- For cursor pagination, use a stable indexed tie-breaker, normally `[sortColumn, id]`, and fetch
  `limit + 1` rows.
- Do not call selectors once per returned row or inside `.map()` loops. Gather IDs, batch indexed
  reads, and join the results with maps in memory.
- When filtering or ordering spans models and cannot fit a practical index, simplify the API or
  maintain a derived query table.
- In-memory sorting is acceptable after an indexed query has bounded the result, including merging
  small indexed result sets. It must not substitute for an index over an unbounded collection.
- Full-table reads are acceptable for explicit migrations, rebuilds, imports, exports, and APIs
  intentionally returning a complete small collection. Keep them out of normal request hot paths.
- Audit route hooks and dispatched actions as part of endpoint performance; expensive work may be
  outside the route handler itself.

# API Support

When adding new functionality to `apps/slices`, also check whether it should be exposed through
the v1 HTTP API in `apps/api/src/http/v1`, and update the API when appropriate.

Every new v1 HTTP API method must be covered by an API E2E test in `apps/api/src/e2e`. The test
must call the method through the generated OpenAPI client and run against the real Fastify server
and database.
