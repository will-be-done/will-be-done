# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Root Level Commands
- `pnpm dev:client` - Start the web client in development mode
- `pnpm dev:server` - Start the API server in development mode

### Web Client (apps/web/)
- `pnpm dev` - Start Vite development server
- `pnpm build` - Build for production (runs TypeScript check + Vite build)
- `pnpm ts` - Run TypeScript compiler check
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm test` - Run Vitest tests
- `pnpm format` - Format code with Prettier

### API Server (apps/api/)
- `pnpm dev` - Start development server with Bun

### Hyperstate Library (apps/hyperstate/)
- `pnpm dev` - Start Vite development server
- `pnpm build` - Build library
- `pnpm lint` - Run ESLint

## Architecture Overview

This is a **monorepo task management application** with three main components:

### Applications Structure
- **`apps/web`** - React 19 + TypeScript client with offline-first architecture
- **`apps/api`** - tRPC API server running on Fastify + Bun with SQLite
- **`apps/hyperstate`** - Custom state management library built on Mutative

### Key Technologies
- **Frontend**: React 19, TanStack Router, Tailwind CSS + Radix UI, wa-sqlite (WASM SQLite)
- **Backend**: Fastify, Bun runtime, tRPC, Kysely ORM
- **State Management**: Custom Hyperstate library with undo/redo, built-in sync
- **Database**: SQLite (client wa-sqlite + server SQLite) with conflict-free sync

### State Management Architecture
The application uses a **slice-based state management** pattern with:
- **Core Slices**: `tasksSlice`, `projectsSlice`, `taskTemplatesSlice`, `projectionsSlice`, `dailyListsSlice`, `focusSlice`
- **Sync System**: Automatic client-server synchronization with logical clocks
- **Local Storage**: wa-sqlite for offline-first experience
- **Change Tracking**: `ChangesTracker` → `ChangesToDbSaver` → `Syncer` pipeline

### Feature Areas
- **Timeline Management** (`/timeline/*`) - Date-based task organization with daily lists
- **Project Management** (`/projects/*`) - Hierarchical project structure with inbox system
- **Template System** - RRule-based recurring task templates with automatic generation
- **Sync System** (`store/sync/`) - Conflict-free synchronization across devices

### Data Models
All entities follow a consistent pattern:
- Base fields: `id`, `orderToken`, `createdAt`, `type`, `isDeleted`
- **Fractional indexing** for ordering without conflicts  
- **Template-driven** task generation using RRule
- **Logical clocks** for synchronization ordering

### Database Schema
Located in `apps/web/src/store/sync/schema.ts` and `apps/api/src/schema.ts` - defines SQLite tables for tasks, projects, templates, and sync metadata.

## Development Notes

### File Organization
- **Routes**: `apps/web/src/routes/` - TanStack Router file-based routing
- **Components**: `apps/web/src/components/` - UI components organized by feature
- **Store**: `apps/web/src/store/` - State management, slices, and sync logic
- **Features**: `apps/web/src/features/` - Feature-specific components and hooks

### State Updates
Always use the Hyperstate actions rather than direct state mutations. State changes automatically trigger sync to local SQLite and server.

### Testing
The web client uses Vitest for testing. Run tests with `pnpm test` in the web directory.

### Sync Architecture
The application is **offline-first** - all functionality works without server connection. Changes sync automatically when connection is available through the broadcast channel system for cross-tab sync.