Implement a standalone HyperDB devtool under src/devtool.

  Context:
  We want a TanStack-devtools-inspired debugging UI for HyperDB actions/selectors. Do not use decorators. Keep the existing wrapper style and rely on named generator functions for labels:

  export const test = action(function* test() {
    // ...
  });

  export const getTasks = selector(function* getTasks() {
    // ...
  });

  Do not use Tailwind. Use goober for all devtool styling.

  Architecture:
  - Add src/devtool as a standalone devtool package area.
  - Add a package export "./devtool": "./src/devtool/index.ts".
  - Add a Vite lib entry named devtool pointing to src/devtool/index.ts.
  - Add goober as a dependency.
  - Export at least:
    - HyperDBDevtools
    - HyperDBDevtoolsPanel
    - tracing/store types needed for tests or advanced users.
  - Do not make core HyperDB import React. Core/runtime/commands may import only framework-agnostic tracing primitives.

  Public React API:
  - HyperDBDevtools props:
    - db?: SubscribableDB; if omitted, read db from existing DBProvider/useDB
    - initialIsOpen?: boolean
    - position?: "top" | "bottom" | "left" | "right", default "bottom"
    - buttonPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right", default "bottom-right"
    - maxTraces?: number, default 200
    - theme?: "dark" | "light" | "system", default "system"
  - HyperDBDevtools should render:
    - a fixed floating toggle button
    - a docked panel when open
    - left trace list
    - right selected trace details
    - clear traces button
  - Persist open/closed state in localStorage.
  - HyperDBDevtoolsPanel should render the panel without the floating button, for embedded use.

  Tracing activation:
  - Capture traces only while at least one devtool listener is mounted.
  - When no listener is mounted, tracing functions should return quickly and avoid storing data.
  - Keep only latest maxTraces root traces, default 200.
  - Root traces are top-level action/selector executions only.
  - If an action calls another action or selector, do not create another root trace. Attach it as a child frame under the active trace.
  - If a selector calls another selector, also attach as a child frame.
  - A top-level direct select through useSelect/useAsyncSelect should still become a root selector trace when it came from selector(...). If a raw generator without selector metadata is used, record it as an
  anonymous root only if doing so is practical without breaking existing behavior.

  Action/selector metadata:
  - Update action(fn) so it still returns a callable function with the same public type behavior.
  - Returned generator instances should carry non-enumerable devtool metadata:
    - kind: "action"
    - name: fn.name || "anonymous action"
    - args: original call arguments
  - Update selector(fn) similarly:
    - kind: "selector"
    - name: fn.name || "anonymous selector"
    - args: original call arguments
  - Preserve current behavior for generator and non-generator selector functions.
  - Do not require devtoolName in v1.
  - Existing call sites like action(function* () {}) and selector(function* () {}) must keep working.

  Critical nesting problem:
  - JS yield* hides the nested generator from runCommandGenerator because the parent generator delegates child yields directly.
  - Solve this by making action/selector wrappers annotate yielded commands with frame metadata.
  - The runner should then attribute each command to the correct child frame.
  - Nested action/selector calls should create frame start/end records around delegated execution if possible.
  - If exact child return timing is hard because of yield* delegation, implement the closest reliable timing with command-level child attribution and document the limitation in code comments/tests.

  Command instrumentation:
  - Instrument runCommandGenerator as the central interception point.
  - For selectRange commands, record:
    - table.tableName
    - index
    - selectQuery.where
    - computed bounds
    - limit
    - order
    - duration
    - result row count
    - result payload
    - status success/error
  - The runner should measure select duration around yield* db.intervalScan(...).
  - If db.intervalScan throws, mark command and trace as failed and rethrow.
  - Preserve options.selectRangeCmds behavior exactly.

  Mutation instrumentation:
  - Instrument SubscribableDBTx write paths because they have enough context for resolved mutation ops.
  - For insert, record:
    - type "insert"
    - table.tableName
    - newValue rows
    - duration
  - For upsert, record:
    - type "upsert"
    - table.tableName
    - oldValue rows when present
    - newValue rows
    - duration
  - For delete, record:
    - type "delete"
    - table.tableName
    - oldValue rows
    - ids
    - duration
  - For plain DB/DBTx paths, do not invent old values. It is acceptable for v1 to only have rich mutation payloads when using SubscribableDB/SubscribableDBTx.
  - Ensure afterInsert/afterUpsert/afterDelete/afterChange subscribers do not create misleading extra root traces. They should attach under the current mutation/action trace if invoked synchronously during the
  same command run.

  Trace data model:
  - Root trace fields:
    - id
    - kind: "action" | "selector" | "unknown"
    - name
    - args
    - startedAt
    - endedAt
    - durationMs
    - status: "running" | "success" | "error"
    - error summary if failed
    - frames/call tree
    - command events
    - mutation events
  - Frame fields:
    - id
    - parentId
    - kind
    - name
    - args
    - startedAt/endedAt/durationMs/status/error
    - children
    - command ids or embedded command events
  - Command event fields:
    - id
    - frameId
    - kind: "select"
    - tableName/index/where/bounds/limit/order
    - resultCount/result
    - startedAt/endedAt/durationMs/status/error
  - Mutation event fields:
    - id
    - frameId
    - kind: "insert" | "upsert" | "delete"
    - tableName
    - rows/ids/oldValue/newValue as applicable
    - startedAt/endedAt/durationMs/status/error
  - Use safe serialization for UI display so circular or unserializable values do not crash the devtool.

  UI details:
  - Style entirely with goober css/styled APIs.
  - Dense devtool aesthetic inspired by TanStack:
    - dark default theme with high-contrast accent
    - compact monospace-ish data areas
    - badges for action/selector/status
    - resizable-looking docked panel feel, but actual resize can be omitted in v1
  - Left panel:
    - newest traces first
    - each row shows type, name, duration, status, counts for selects/mutations, timestamp
    - selected trace highlighted
  - Right panel:
    - header with trace name/status/duration
    - tabs or segmented control for Overview, Data, Mutations, Call Tree
    - Overview: args, timing, status, counts
    - Data: select events with query metadata and result preview
    - Mutations: insert/upsert/delete payloads
    - Call Tree: nested frames with timings and attached command counts
  - Include empty state when no traces exist.
  - Include clear button.
  - Avoid in-app explanatory copy beyond necessary labels.

  Tests:
  - Add unit tests for tracing primitives:
    - listener activation/deactivation
    - retention cap
    - root trace lifecycle success/error
    - nested frame attachment
    - no stored traces when inactive
  - Add command/runtime tests:
    - action with select records one root action trace and select event
    - action calling action records one root with child frame
    - selector calling selector records one root with child frame
    - select event includes table, index, where, limit, order, bounds, result count, result payload
    - select errors mark command/trace failed and rethrow
    - insert/upsert/delete through SubscribableDBTx record mutation payloads
    - upsert includes oldValue and newValue
    - existing action/selector tests continue passing
  - Add React/component smoke tests if existing test setup supports it without major new tooling:
    - HyperDBDevtools renders toggle/panel
    - selecting a trace displays details
    - clear button clears traces
    - localStorage open state is respected
  - If component smoke tests require too much setup, keep UI tests minimal and prioritize tracing/runtime coverage.

  Validation:
  - Run these from apps/hyperdb-lib:
    - bun run test
    - bun run ts
    - bun run build
  - Fix all failures caused by the implementation.
  - Do not run formatters that rewrite unrelated files.
  - Do not modify unrelated dirty files such as todo.md.

  Important implementation cautions:
  - Preserve public type inference for selectFrom(...).where(...), action(...), selector(...), useDispatch, useSelect, useSyncSelector, and useAsyncSelector.
  - Preserve runCommandGenerator options.selectRangeCmds behavior.
  - Avoid global context bugs with async execution. If tracing uses global active state, make sure overlapping async selectors/actions do not attach events to the wrong trace.
  - Prefer a tiny tracing context object threaded through command metadata over relying on a single mutable global.
  - Do not import React from core command/runtime files.
  - Do not introduce Tailwind, tailwind-merge, CSS modules, or global CSS.
  - Keep the implementation scoped to devtool/tracing plus the minimum necessary hooks in action/selector/runner/SubscribableDBTx/package config.


