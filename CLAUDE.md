# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Root Level Commands
- `bun dev:client` - Start the web client in development mode (Vite dev server)
- `bun dev:server` - Start the API server in development mode (Fastify + Bun)

### Web Client (apps/web/)
- `bun dev` - Start Vite development server with React 19
- `bun build` - Build for production (TypeScript check + Vite build)
- `bun ts` - Run TypeScript compiler check
- `bun lint` - Run ESLint
- `bun lint:fix` - Run ESLint with auto-fix
- `bun test` - Run Vitest tests
- `bun format` - Format code with Prettier

### API Server (apps/api/)
- `bun dev` - Start development server with Bun (runs src/start.ts)

### Slices Library (apps/slices/)
- `bun ts` - Run TypeScript compiler check

## Architecture Overview

This is a **monorepo task management application** with a shared state management system across client and server.

### Applications Structure

#### `apps/web` - React 19 Client
The frontend application built with modern React and TypeScript.

**Key Technologies:**
- **Framework**: React 19 with React Compiler (babel-plugin-react-compiler)
- **Routing**: TanStack Router v1 with file-based routing and auto code splitting
- **Styling**: Tailwind CSS v4 with @base-ui-components/react and select Radix UI components (dialog, popover, separator, slot)
- **State Management**: Custom hyperdb-based system with shared slices
- **Build Tool**: Vite 7 with React plugin
- **Testing**: Vitest with jsdom
- **Forms**: TanStack React Form with Zod validation
- **HTTP Client**: tRPC client for type-safe API calls
- **Drag & Drop**: @atlaskit/pragmatic-drag-and-drop

**Project Structure:**
```
apps/web/src/
├── routes/                                        # TanStack Router file-based routes
│   ├── __root.tsx                                # Root layout
│   ├── index.tsx                                 # Home/redirect page
│   ├── landing.tsx                               # Landing page
│   ├── login.tsx                                 # Login page
│   ├── signup.tsx                                # Signup page
│   ├── spaces.tsx                                # Spaces layout
│   ├── spaces.index.tsx                          # Spaces list
│   ├── spaces.$spaceId.tsx                       # Space layout
│   ├── spaces.$spaceId.projects.index.tsx        # Projects list
│   ├── spaces.$spaceId.projects.$projectId.tsx   # Project view
│   ├── spaces.$spaceId.timeline.index.tsx        # Timeline view
│   └── spaces.$spaceId.timeline.$date.tsx        # Daily timeline
├── components/          # Reusable UI components
│   ├── Details/
│   ├── Layout/
│   ├── Task/
│   ├── TasksGrid/
│   └── ui/             # Base UI components
├── store/              # Store slices
│   └── slices/
│       ├── focusSlice.ts
│       └── load.ts
├── lib/                # Utility libraries
│   ├── dnd/           # Drag and drop functionality
│   └── utils.ts
└── main.tsx           # Application entry point
```

**Route Structure Notes:**
- TanStack Router uses dot-notation for nested routes (not folder hierarchy)
- All project/timeline routes are under a `spaces.$spaceId` hierarchy for multi-space support
- Authentication routes (login, signup, landing) are at the root level
- Dynamic segments use `$paramName` syntax (e.g., `$spaceId`, `$projectId`, `$date`)

**Development Notes:**
- The app uses React 19's new features and the React Compiler for automatic optimization
- Vite proxy forwards `/api` requests to `localhost:3000` (API server)
- Path alias `@` points to `apps/web/src/`

#### `apps/api` - tRPC API Server
The backend server providing synchronization and data persistence.

**Key Technologies:**
- **Runtime**: Bun (fast JavaScript runtime)
- **Framework**: Fastify with tRPC adapter
- **Database**: SQLite (via bun:sqlite)
  - Main database: `dbs/main.sqlite` - User accounts and space metadata
  - Space databases: `dbs/{spaceId}.sqlite` - Per-space data isolation
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
- **Authentication**: Token-based authentication system with user accounts and space-scoped access control
  - Each space has its own access controls tied to user ownership
  - JWT-based session management
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
├── app.ts                      # Core application slice with unified byId selector
├── cards.ts                    # Core cards system
├── cardsTasks.ts               # Task management (create, update, toggle, delete)
├── cardsTaskTemplates.ts       # Recurring task templates (RRule-based)
├── projects.ts                 # Project hierarchy
├── projectsAll.ts              # All projects view
├── projectsCategories.ts       # Project categorization
├── projectsCategoriesCards.ts  # Cards within project categories
├── dailyLists.ts               # Daily task lists
├── dailyListsProjections.ts    # Task projections (views/filters)
├── backup.ts                   # Backup/restore functionality
├── changes.ts                  # Change tracking for sync
├── syncMap.ts                  # Sync table registry
├── maps.ts                     # Model type registry
└── utils.ts                    # Shared utilities
```

**Data Models:**

All entities follow a consistent pattern:
- **Base Fields**: `type`, `id`, `orderToken`, `createdAt`
- **Soft Deletion**: No explicit `isDeleted` in most models (handled via changes)
- **Fractional Indexing**: `orderToken` for conflict-free ordering without re-indexing
- **Type Discrimination**: `type` field for polymorphic queries

**Key Data Models:**

The application uses a hierarchical structure: **Project → ProjectCategory → Tasks**

1. **Task**
   ```typescript
   {
     type: "task",
     id: string,
     title: string,
     state: "todo" | "done",
     projectCategoryId: string,  // Parent category (replaces projectId + taskGroupId)
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

3. **ProjectCategory** - Organizational categories within projects
   ```typescript
   {
     type: "projectCategory",
     id: string,
     title: string,
     projectId: string,  // Parent project
     orderToken: string,
     createdAt: number
   }
   ```

4. **TaskTemplate** - For recurring tasks using RRule
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

### Multi-Space Architecture

The application supports multiple workspaces (called "spaces"), enabling users to maintain separate work contexts with complete data isolation.

**Key Features:**
- **Isolated Databases**: Each space has its own SQLite database (`dbs/{spaceId}.sqlite`)
- **User Ownership**: Each space is owned by a specific user (tied to userId)
- **Independent Data**: Projects, tasks, categories, and settings are completely separate per space
- **Space-Scoped Routing**: All routes are structured as `spaces.$spaceId.*` to scope operations to the current space
- **Independent Sync**: Each space maintains its own sync state and change tracking

**Space Management:**
- Users can create multiple spaces from the spaces list page
- Switching between spaces changes the active database and context
- Authentication system ties users to their spaces for access control
- Each space contains:
  - Projects and project categories
  - Tasks and task templates
  - Daily lists and projections
  - Space-specific settings and preferences

**Database Structure:**
- Main database: `dbs/main.sqlite` - Stores user accounts and space metadata
- Space databases: `dbs/{spaceId}.sqlite` - One per space, contains all space-specific data
- Space IDs are UUIDs for uniqueness and security

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
- React 19 + TypeScript + Vite 7
- TanStack Router + TanStack Form
- Tailwind CSS 4 + @base-ui-components/react with select Radix UI components
- tRPC Client
- Vitest for testing
- @atlaskit/pragmatic-drag-and-drop for drag & drop

**Backend:**
- Bun runtime
- Fastify + tRPC Server
- SQLite (bun:sqlite) with multi-database architecture
  - Main database for users and space metadata
  - Per-space databases for data isolation
- Custom hyperdb abstraction
- Token-based authentication with JWT

**Shared:**
- TypeScript 5.7
- Zod validation
- Custom hyperdb state management
- Fractional indexing for ordering
- RRule for recurring tasks
- Hybrid logical clock for distributed sync

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

### Database:
- Main database: `apps/api/dbs/main.sqlite` - User accounts and space metadata
- Space databases: `apps/api/dbs/{spaceId}.sqlite` - Per-space data isolation
- Client uses in-browser storage (implementation in `apps/web`)
- Each space gets its own database instance for complete data isolation

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
