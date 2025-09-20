# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `pnpm dev` - Start Vite development server
- `pnpm build` - Build for production (runs TypeScript check + Vite build)
- `pnpm ts` - Run TypeScript compiler check
- `pnpm lint` - Run ESLint
- `pnpm test` - Run Vitest tests (with CI=true)
- `pnpm preview` - Preview production build

## Architecture Overview

This is a **type-safe database library** that provides a unified interface for different storage backends with reactive capabilities.

### Core Components

**Database Interface (`src/hyperdb/db.ts`)**
- `HyperDB` - Main database interface with `intervalScan`, `insert`, `update`, `delete` operations
- `DB` - Core implementation class that wraps database drivers
- `DBDriver` - Interface for pluggable storage backends

**Storage Drivers (`src/hyperdb/drivers/`)**
- `SqlDriver` - SQLite backend using sql.js with JSON column storage
- `InmemDriver` - In-memory backend using B+ trees (currently commented out)
- `BptreeInmemDriver` - B+ tree implementation for in-memory storage

**Table Definition System (`src/hyperdb/table.ts`)**
- Type-safe table creation with `table<T>(name).withIndexes(indexes)`
- Index types: `"hash"` for exact lookups, `"btree"` for range queries
- Automatic validation of index column uniqueness and id index requirement

**Reactive Layer (`src/hyperdb/subscribable-db.ts`)**
- `SubscribableDB` - Wrapper that adds change notifications
- Operation types: `InsertOp`, `UpdateOp`, `DeleteOp`
- Subscription system for reactive updates

**Query System (`src/hyperdb/selector.ts`)**
- Generator-based selectors with `selectRange` function
- Automatic invalidation and re-execution when dependent data changes
- `initSelector` for creating reactive selectors

**React Integration (`src/react/`)**
- `useSyncSelector` hook for reactive queries in React components
- `useDB` context hook for accessing database instance

### Key Design Patterns

**Type Safety**
- All operations are fully typed with TypeScript
- `ExtractSchema<TTable>` and `ExtractIndexes<TTable>` type utilities
- Compile-time validation of table schema and index definitions

**Storage Abstraction**
- Driver pattern allows switching between SQLite and in-memory storage
- Consistent API across all storage backends
- SQL driver stores data as JSON in text columns with JSON path indexes

**Reactive Queries**
- Selectors automatically track which data they depend on
- Change notifications trigger re-execution only when relevant data changes
- Generator-based query syntax for lazy evaluation

**Index Management**
- Automatic index creation and maintenance
- Composite indexes with tuple-based range queries
- Unique constraints and validation

### Data Flow

1. **Table Definition** → Define schema and indexes with type safety
2. **Database Creation** → Initialize with chosen driver (SQL/in-memory)
3. **Reactive Wrapper** → Wrap with SubscribableDB for change notifications
4. **Query Execution** → Use selectors for reactive queries
5. **React Integration** → Connect to React components via hooks

### Development Notes

- Uses Vitest for testing with `CI=true` flag
- ESLint configuration includes React and TypeScript rules
- SQL.js requires proper async initialization for browser environments
- B+ tree implementation provides efficient range queries for in-memory storage
- Change tracking enables optimistic UI updates and sync capabilities