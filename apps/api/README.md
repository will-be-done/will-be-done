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

Every HTTP endpoint has a general limit of 300 requests per minute per IP.
Login, registration, and Todoist imports have stricter targeted limits. The
limiter is enabled by default and can be explicitly disabled with
`WBD_RATE_LIMIT_ENABLED=false`. The default in-memory backend is suitable for
one API process. For multiple instances, set `WBD_RATE_LIMIT_BACKEND=redis`
and `WBD_REDIS_URL`; use a deployment-specific `WBD_RATE_LIMIT_NAMESPACE` when
environments share Redis.
The targeted limits are 10 logins per 10 minutes per IP, 5 registrations per
hour per IP, and 3 Todoist imports per hour per user. Redis errors are logged
and fail open so a transient Redis outage does not take down the API.

Recurring tasks are generated lazily when an authenticated v1 request accesses
a space. Each template keeps a persisted generation checkpoint and is checked
at most once every 60 seconds by default. Set
`WBD_TASK_GENERATION_INTERVAL_MS` to change the interval (minimum 1000).

## Database engines

SQLite remains the default and needs no external service. To use Turso Cloud,
set `WBD_DB_ENGINE=turso` and configure the `WBD_TURSO_*` variables documented
in `.env.example`. The server keeps one main database plus separate user and
space databases. All missing databases, including the main database, are
provisioned in the configured Turso group on first access.

Use an organization-scoped Turso Platform API token and store it in the
deployment's secret manager. The API uses it to mint one-hour, database-scoped
tokens, keeps those tokens only in process memory, and refreshes connections
halfway through the tokens' one-hour lifetime. It never stores a group token or
a user database token. The existing local SQLite S3 backup worker is not
supported in Turso mode; use Turso backups/PITR instead.

Create the organization-scoped Platform API token with:

```bash
turso auth api-tokens mint will-be-done --org your-org
```

Only the Platform token is secret. Database names and URLs are discovered from
Turso and do not need to be stored separately.

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
