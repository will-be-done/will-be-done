# API

To install dependencies:

```bash
pnpm install
```

To run:

```bash
pnpm dev
```

The existing synchronization API remains available at `/api/trpc`.

Recurring tasks are generated lazily when an authenticated v1 request accesses
a space. Each template keeps a persisted generation checkpoint and is checked
at most once every 60 seconds by default. Set
`WBD_TASK_GENERATION_INTERVAL_MS` to change the interval (minimum 1000).

## Database engines

SQLite remains the default and needs no external service. To use Turso Cloud,
set `WBD_DB_ENGINE=turso` and configure the `WBD_TURSO_*` variables documented
in `.env.example`. The server keeps one main database plus separate user and
space databases; missing user and space databases are provisioned in the
configured Turso group on first access.

`WBD_TURSO_AUTH_TOKEN` must be a full-access group token so it also covers
databases provisioned after startup. The existing local SQLite S3 backup worker
is not supported in Turso mode; use Turso backups/PITR instead.

To migrate an existing installation, stop the API and first run a validation-only
pass:

```bash
WBD_TURSO_ORG=your-org \
WBD_TURSO_PLATFORM_TOKEN=your-platform-token \
WBD_TURSO_GROUP=default \
WBD_TURSO_DATABASE_PREFIX=wbd \
pnpm --filter @will-be-done/api db:migrate:turso -- --db-path /path/to/db
```

Review the source-to-database mapping, then repeat with `--execute`. The command
checkpoints and validates every `main-`, `user-`, and `space-*.sqlite` file,
creates upload-only databases, and refuses to run if any destination already
exists. It prints the main database URL needed by the runtime when complete.

## Public API

The versioned HTTP API uses bearer-token authentication. Core read endpoints
include:

```text
GET /api/v1/spaces/:spaceId
GET /api/v1/spaces/:spaceId/projects
GET /api/v1/spaces/:spaceId/projects/:projectId
GET /api/v1/spaces/:spaceId/sections/:sectionId
GET /api/v1/spaces/:spaceId/tasks
GET /api/v1/spaces/:spaceId/daily-lists?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/v1/spaces/:spaceId/scheduled-tasks?scope=overdue|upcoming
```

The space task endpoint is intentionally a basic creation-time listing. It
supports opaque `cursor` pagination and a `limit` of up to 200.

The response contains the space's projects in display order. Interactive API
documentation powered by Scalar is served at `/api/docs`, and the raw OpenAPI
document is served at `/api/openapi.json`.

The hosted documentation is available at
[app.will-be-done.app/api/docs](https://app.will-be-done.app/api/docs). For a
self-hosted Docker deployment, open `/api/docs` on the server's base URL.

After changing a public route or schema, update and verify the committed API
contract with:

```bash
pnpm openapi:generate
pnpm client:generate
pnpm openapi:check
```

`client:generate` rebuilds the internal typed Fetch client in `src/generated`.
CI regenerates it from `openapi.json` and fails when the committed client is
stale.
