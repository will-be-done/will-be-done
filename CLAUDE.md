# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Root Level Commands
- `bun dev:client` - Start the web client in development mode (Vite dev server)
- `bun dev:server` - Start the API server in development mode (Fastify + Bun)

### Web Client (apps/web/)
- `pnpm dev` - Start Vite development server with React 19
- `pnpm build` - Build for production (TypeScript check + Vite build)
- `pnpm ts` - Run TypeScript compiler check
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm test` - Run Vitest tests
- `pnpm format` - Format code with Prettier

### API Server (apps/api/)
- `pnpm dev` - Start development server with Bun (runs src/start.ts)

### Slices Library (apps/slices/)
- `pnpm ts` - Run TypeScript compiler check

## Architecture Overview

This is a **monorepo task management application** with a shared state management system across client and server.

### Applications Structure

#### `apps/web` - React 19 Client
The frontend application built with modern React and TypeScript.

**Key Technologies:**
- **Framework**: React 19 with React Compiler (babel-plugin-react-compiler)
- **Routing**: TanStack Router v1 with file-based routing and auto code splitting
- **Styling**: Tailwind CSS v4 with Radix UI components
- **State Management**: Custom hyperdb-based system with shared slices
- **Build Tool**: Vite 6 with React plugin
- **Testing**: Vitest with jsdom
- **Forms**: TanStack React Form with Zod validation
- **HTTP Client**: tRPC client for type-safe API calls
- **Drag & Drop**: @atlaskit/pragmatic-drag-and-drop

**Project Structure:**
```
apps/web/src/
├── routes/              # TanStack Router file-based routes
│   ├── __root.tsx      # Root layout
│   ├── index.tsx       # Home page
│   ├── projects/       # Project management routes
│   │   ├── index.tsx
│   │   └── $projectId.tsx
│   ├── timeline/       # Timeline view routes
│   │   ├── index.tsx
│   │   └── $date.tsx
│   └── timeline2/      # Alternative timeline view
├── components/          # Reusable UI components
│   ├── Details/
│   ├── Layout/
│   ├── Task/
│   ├── TasksGrid/
│   └── ui/             # Base UI components
├── features/           # Feature-specific components and logic
│   ├── dnd/           # Drag and drop functionality
│   ├── focus/         # Focus mode features
│   ├── global-listener/
│   ├── project/       # Project-specific features
│   └── timeline/      # Timeline-specific features
├── store2/            # Store slices
│   └── slices/
│       ├── focusSlice.ts
│       └── load2.ts
├── lib/               # Utility libraries
│   └── utils.ts
└── main.tsx          # Application entry point
```

**Development Notes:**
- The app uses React 19's new features and the React Compiler for automatic optimization
- Vite proxy forwards `/api` requests to `localhost:3000` (API server)
- Path alias `@` points to `apps/web/src/`
- Uses react-scan for development performance monitoring

#### `apps/api` - tRPC API Server
The backend server providing synchronization and data persistence.

**Key Technologies:**
- **Runtime**: Bun (fast JavaScript runtime)
- **Framework**: Fastify with tRPC adapter
- **Database**: SQLite (via bun:sqlite) stored in `dbs/main2.sqlite`
- **Database Abstraction**: Custom hyperdb with SqlDriver
- **RPC**: tRPC for type-safe client-server communication
- **File Upload**: @fastify/multipart for handling uploads
- **Static Files**: @fastify/static for serving built frontend

**Project Structure:**
```
apps/api/src/
├── start.ts    # Main server entry point (Fastify setup, routes, tRPC router)
├── trpc.ts     # tRPC initialization and helpers
└── index.ts    # Exports AppRouter type for client
```

**API Endpoints:**
- `POST /api/trpc/getChangesAfter` - Fetch changes after a specific timestamp
- `POST /api/trpc/handleChanges` - Submit client changes for server merge
- `POST /upload` - Upload audio files for transcription (memos feature)
- All non-API routes serve `public/index.html` for SPA routing

**Key Features:**
- **Logical Clock**: Hybrid logical clock for change ordering (`timestamp-sequence-clientId`)
- **Change Tracking**: Automatic tracking of all database changes via hyperdb hooks
- **Sync System**: Bidirectional sync with conflict-free merge
- **Authentication**: Basic HTTP auth (bypassed in development mode)
- **Audio Transcription**: Background processing of uploaded audio memos
  - Files stored in `dbs/memos/`
  - Transcribed via external service at `http://tosi-bosi.com:3284/transcribe`
  - Automatically creates tasks from transcripts

**Database Hooks:**
The server registers `afterInsert`, `afterUpdate`, and `afterDelete` hooks on hyperDB to automatically create change records for synchronization. Changes skip the `changesTable` itself and any operations with `skip-sync` trait.

#### `apps/slices` - Shared State Management Library
A TypeScript library containing shared business logic and data models used by both client and server.

**Key Technologies:**
- **Database Abstraction**: Custom hyperdb with selectors, actions, and tables
- **Utilities**: date-fns, es-toolkit, uuid, RRule (recurring events)
- **Ordering**: fractional-indexing-jittered for conflict-free ordering
- **Validation**: Zod schemas

**Core Concepts:**
- **Slices**: Modular state containers with selectors and actions (similar to Redux slices)
- **Selectors**: Generator functions that query and compute derived state
- **Actions**: Generator functions that mutate state
- **Tables**: Type-safe database table definitions with indexes

**Available Slices:**
```
apps/slices/src/slices/
├── app.ts              # Core application slice with unified byId selector
├── tasks.ts            # Task management (create, update, toggle, delete)
├── projects.ts         # Project hierarchy and inbox
├── projectItems.ts     # Project items management
├── taskGroups.ts       # Task grouping functionality
├── taskTemplates.ts    # Recurring task templates (RRule-based)
├── projections.ts      # Task projections (views/filters)
├── dailyLists.ts       # Daily task lists
├── allProjects.ts      # All projects view
├── changes.ts          # Change tracking for sync
├── syncMap.ts          # Sync table registry
├── maps.ts             # Model type registry
├── drop.ts             # Drag and drop logic
└── utils.ts            # Shared utilities
```

**Data Models:**

All entities follow a consistent pattern:
- **Base Fields**: `type`, `id`, `orderToken`, `createdAt`
- **Soft Deletion**: No explicit `isDeleted` in most models (handled via changes)
- **Fractional Indexing**: `orderToken` for conflict-free ordering without re-indexing
- **Type Discrimination**: `type` field for polymorphic queries

**Key Data Models:**
1. **Task**
   ```typescript
   {
     type: "task",
     id: string,
     title: string,
     state: "todo" | "done",
     projectId: string,
     taskGroupId: string | null,
     orderToken: string,
     lastToggledAt: number,
     horizon: "week" | "month" | "year" | "someday",
     createdAt: number,
     templateId: string | null,
     templateDate: number | null
   }
   ```

2. **Project**
   ```typescript
   {
     type: "project",
     id: string,
     title: string,
     icon: string,
     isInbox: boolean,
     orderToken: string,
     createdAt: number
   }
   ```

3. **TaskTemplate** - For recurring tasks using RRule
   ```typescript
   {
     type: "taskTemplate",
     id: string,
     title: string,
     rrule: string,
     projectId: string,
     orderToken: string,
     createdAt: number
   }
   ```

**Table Indexes:**
Tables use strategic indexes for performance:
- Hash indexes for single-key lookups (`byId`)
- BTree indexes for range queries and ordering (`byIds`, `byOrderToken`, `byProjectIdOrderStates`)

**Slice Registration:**
Slices register themselves in two registries:
- `registeredSyncableTables` - Tables that participate in sync
- Model slice registry - Type-to-slice mapping for polymorphic operations

### Cross-Application Data Flow

1. **Client Change** → `apps/web` modifies data via slice actions
2. **Local Persistence** → hyperdb stores in browser (IndexedDB or similar)
3. **Change Tracking** → Changes recorded in `changesTable`
4. **Sync to Server** → tRPC `handleChanges` mutation sends changes
5. **Server Merge** → `apps/api` merges changes with logical clock ordering
6. **Server Broadcast** → Other clients fetch via `getChangesAfter`
7. **Client Apply** → Clients merge server changes locally

### Synchronization Architecture

**Logical Clock System:**
- Format: `timestamp-sequence-clientId`
- Example: `1700000000000-0001-client-abc123`
- Provides total ordering of changes across distributed clients
- Timestamp for rough ordering, sequence for same-millisecond events, clientId for tie-breaking

**Change Types:**
The system tracks three types of changes:
- **Insert**: New entity creation
- **Update**: Field modifications
- **Delete**: Entity removal

**Conflict Resolution:**
- Last-write-wins based on logical clock comparison
- Fractional indexing prevents ordering conflicts
- Server acts as the source of truth for clock synchronization

### Technology Stack Summary

**Frontend:**
- React 19 + TypeScript + Vite 6
- TanStack Router + TanStack Form
- Tailwind CSS 4 + Radix UI
- tRPC Client
- Vitest for testing

**Backend:**
- Bun runtime
- Fastify + tRPC Server
- SQLite (bun:sqlite)
- Custom hyperdb abstraction

**Shared:**
- TypeScript 5.7
- Zod validation
- Custom hyperdb state management
- Fractional indexing for ordering
- RRule for recurring tasks

## Development Workflow

### Starting Development
1. Start API server: `bun dev:server` (runs on port 3000)
2. Start web client: `bun dev:client` (runs on Vite dev server, proxies API)
3. Access application at `http://localhost:5173` (or Vite's assigned port)

### Common Tasks

**Adding a New Feature:**
1. Define data model in `apps/slices/src/slices/` if needed
2. Register table with `registerSyncableTable()` for sync support
3. Create slice with selectors (queries) and actions (mutations)
4. Use slice in `apps/web` components via hyperdb hooks
5. Server automatically syncs changes via registered hooks

**Adding a New Route:**
1. Create file in `apps/web/src/routes/` following TanStack Router conventions
2. Use dynamic segments with `$paramName.tsx` syntax
3. Export route component with `createFileRoute()`
4. Route tree auto-generates in `routeTree.gen.ts`

**Modifying Sync Behavior:**
1. Edit slice actions in `apps/slices/src/slices/`
2. Changes automatically tracked via hyperdb hooks
3. Use `withTraits({ type: "skip-sync" })` to bypass sync for specific operations

**Database Schema Changes:**
1. Update type definitions in relevant slice file
2. Update table definition with new fields/indexes
3. Migration handled by hyperdb's `loadTables()` on startup
4. Both client and server must load updated tables

## Important Notes

### Do NOT modify these packages:
- `apps/hyperdb` - Custom database package (internal dependency)
- `apps/hyperstate` - Deprecated, no longer in use
- `apps/transcript-server` - Not part of core application

### Authentication:
- Development mode bypasses auth (`NODE_ENV === "development"`)
- Production requires Basic HTTP auth via `AUTH_USERNAME` and `AUTH_PASSWORD` env vars
- Upload endpoint (`/upload`) always bypasses auth

### Database:
- Server database: `apps/api/dbs/main2.sqlite`
- Client uses in-browser storage (implementation in `apps/web`)
- Inbox project created automatically on server startup

### Code Style:
- Use generator functions (`function*`) for slices
- Prefer fractional indexing over numeric indexes
- Use Zod for all API input validation
- Follow TanStack Router conventions for routing

### Performance:
- Indexes are critical for query performance
- Use hash indexes for equality lookups
- Use btree indexes for range queries and ordering
- Batch changes when possible to reduce sync overhead
