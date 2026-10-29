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

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences override anything here. If a rule fights the task in front of you, say so loudly and get a human sign-off before breaking it.

# How it works

Will Be Done is local-first. The domain model (schemas, selectors, actions) lives in
`apps/slices` and runs unchanged in the browser and on the server. The web client keeps a full
HyperDB database in the browser (`PreloadedHybridDB` over wa-sqlite or IndexedDB), applies user
actions locally, and syncs changes to the API in the background. The API applies the same slices
to SQLite databases per user and per space (local files, Turso Cloud, or `tursod`) and serves
sync, auth, and the v1 HTTP API. Sync rules live in `docs/sync.md`.

# Where code lives

- `apps/slices` - shared schemas, selectors, actions, sync protocol, and storage migrations.
- `apps/web` - React/Vite client. `src/store` owns local persistence and the client syncer.
- `apps/api` - Bun server: sync, auth, backups, importers, and the v1 HTTP API in `src/http/v1`.
- `apps/desktop` - Electron shell that loads the web app from a server; its own renderer only
  covers connection and recovery screens.
- `apps/tursod` - Rust database server, one of the API's storage engines.
- `apps/landing` - Astro marketing site, public docs, and release notes.

# Ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or kill a PID found by matching a
   name or path. Several worktrees and dev servers run on this machine at once, and your own agent
   process has the worktree path in its argv. Kill only a PID you captured at spawn.
2. **Shipping by accident.** Never run `deploy:*`, `release:desktop`, or `fly` commands, or point
   dev at staging or production databases, unless explicitly asked.
3. **Breaking local data.** Users' databases live in their browsers and are not migrated in one
   place. Schema and storage changes need a migration path for existing local data and existing
   synced clients; never assume a fresh database.

# Hit every surface

The most common defect is a change that works on the path you tested and is missing everywhere
else. Before calling work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from one view is usually also reachable from others
  (project, daily, stash, calendar), keyboard shortcuts, context menus, and drag-and-drop. Fixing
  one is not fixing the feature.
- **Surfaces.** Web, desktop, and the v1 HTTP API (see API Support). Logic that both client and
  server need belongs in `apps/slices`, not in a component or route handler.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Schedule needs
  unschedule, stash needs unstash, done needs undo, a new field needs a way to clear it. A one-way
  door is a bug.
- **Offline and sync.** New fields and tables must sync, survive offline edits, and merge
  correctly across devices and tabs.
- **Docs.** Check whether the change makes existing guidance inaccurate (see Documentation).

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

# Verifying

- Run checks for the packages you touched: `pnpm --filter @will-be-done/<web|slices|api> ts`,
  `lint`, and `test`. Do not run repo-wide checks or E2E suites unless asked; CI owns the full
  suite. While iterating, run the single test file you are working on.
- Test behavior that can break: sync, merge, clocks, actions, storage migrations, drop rules,
  date and recurrence logic, API handlers, and the logic a bug fix changed. Leave out tests for
  what types already guarantee, trivial logic, copy text, and static markup.
- Extend before you add. When an existing test or table covers the behavior, add a row or an
  assertion there. Test at one layer: the lowest one that fails on `main`. Shared logic is tested
  once in `apps/slices`, not again in web and api.
- Logic, data, state, and sync bugs get a failing test first, then the fix. Purely visual bugs
  get before/after screenshots as proof and no test.
- No sleeps, polling loops, or wall-clock deltas in tests. Await the promise, event, or state that
  marks the milestone. A test that needs a timeout to pass is wrong; fix flaky tests, do not retry
  them.

# Taste

- Inferred types over annotations. `any` is the enemy.
- Default to no comment. Write one only for a constraint, an external quirk, or an invariant the
  code can't show, in one line where you can. Don't restate names, narrate steps, or explain the
  fix you just made; the commit carries that.
- React effects are for synchronizing with something outside React. Derive in render and act in
  handlers instead of syncing state.
- The app should feel instant. No loading spinners where local data can answer, no dropped frames
  in lists or drag-and-drop, no continuously repainting animations.

# Documentation

Most code changes do not need a documentation change. Agents can read the code.

- `docs/` is internal: architectural decisions and their reasons, constraints that span
  components (such as the sync invariants), implementation traps that are hard to discover from
  the source, and maintainer/operator setup. Before adding a paragraph, ask what a maintainer
  would get wrong without it. If reading the relevant code answers the question, leave it out.
- Do not document every feature, enumerate fields or methods, narrate control flow, maintain file
  catalogs, or append PR summaries. Types, tests, and code already record the implementation.
- A local reason the code can't show goes in a short nearby code comment. Use an internal doc when
  the reasoning crosses boundaries or needs context the code cannot carry well. Link to the
  relevant source instead of copying it.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not
  append another account of the new behavior. A new internal doc needs a distinct, durable reason
  to exist.
- Public user docs live in `apps/landing/src/content/docs/docs`. Leave them alone unless the
  change alters how a user accomplishes something: a new feature, a changed workflow, a keyboard
  shortcut, offline/sync behavior users can observe, self-hosting, or the API. A UI tweak or a
  new control does not need a docs entry. When an update is needed, edit the existing feature
  section in the product's voice, without implementation details or contributor tooling.
- The generated OpenAPI reference documents v1 endpoints. Touch the public API page only when how
  to use the API changes, such as auth or SDK generation, not for each new endpoint.
- Do not write release notes in `apps/landing/src/content/releases` unless asked.
