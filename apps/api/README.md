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

## Sentry

`apps/api` and `apps/tursod` initialize Sentry only when
`WBD_SENTRY_DSN` contains a non-empty DSN. Set the secret separately for each
deployed service. `WBD_SENTRY_ENVIRONMENT` and `WBD_SENTRY_RELEASE` add the
corresponding event tags but do not enable Sentry by themselves. Both services
read `WBD_SENTRY_TRACES_SAMPLE_RATE` as a number from 0 to 1. A value of `0`
disables tracing without disabling error capture. The API defaults to `0.1`.
Tursod defaults to `0`.

The API sends an `API Sentry initialized` log when Sentry starts. It also sends
`console.warn` and `console.error` calls as logs. Set `WBD_SENTRY_DEBUG=true` to
write Sentry SDK diagnostics to the process log while you investigate delivery.

The Fly configuration sets `WBD_SENTRY_ENVIRONMENT` to `staging` or
`production`. Store each DSN as a Fly secret:

```bash
fly secrets set WBD_SENTRY_DSN=<api-dsn> --app wbd-app-prod
fly secrets set WBD_SENTRY_DSN=<tursod-dsn> --app wbd-tursod-prod
```

Every HTTP endpoint has a general limit of 300 requests per minute per IP.
Set `WBD_RATE_LIMIT_GLOBAL_MAX` to change the number of requests allowed in
that one-minute window.
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

SQLite remains the default and needs no external service. Two Turso-based
engines are also available:

- Set `WBD_DB_ENGINE=turso-cloud` and configure the `WBD_TURSO_*` variables to
  use Turso Cloud. The server keeps one main database plus separate user and
  space databases. Missing databases are provisioned in the configured Turso
  group on first access.
- Set `WBD_DB_ENGINE=tursod` and provide `WBD_TURSOD_URL` to use the local Rust
  service in `apps/tursod`. It stores `main-main`, `user-{uuid}`, and
  `space-{uuid}` databases under its configured data directory.

### Turso Cloud credentials

For `turso-cloud`, use an organization-scoped Turso Platform API token and store
it in the deployment's secret manager. The API uses it to mint one-hour,
database-scoped tokens, keeps those tokens only in process memory, and refreshes
connections halfway through the tokens' one-hour lifetime. It never stores a
group token or a user database token.

Create the organization-scoped Platform API token with:

```bash
turso auth api-tokens mint will-be-done --org your-org
```

Only the Platform token is secret. Database names and URLs are discovered from
Turso and do not need to be stored separately.

### tursod

The tursod engine does not use a Turso Platform token. Configure the same
`WBD_TURSOD_AUTH_TOKEN` secret for tursod and the API, in addition to
`WBD_TURSOD_URL`. The existing local SQLite S3 backup worker is not supported
with either Turso engine. Use Turso Cloud backups/PITR for `turso-cloud` and a
backup process designed for the tursod data directory for `tursod`.

For local tursod development, run the combined environment with:

```bash
WBD_DB_ENGINE=tursod pnpm all
```

The development runner chooses a separate tursod port, waits for the Rust
service, and injects its URL into the API. To run it separately, use
`pnpm dev:tursod`; tursod accepts `TURSOD_HOST`, `TURSOD_PORT` (falling back to
`PORT`), and `TURSOD_DB_PATH`. It defaults to `127.0.0.1:3000` with a `db`
directory under its working directory. Set `TURSOD_HOST` explicitly when
non-loopback binding is required. All database execution requests require
`WBD_TURSOD_AUTH_TOKEN`; keep the token secret and do not expose tursod directly to
an untrusted network.

tursod writes newline-delimited structured JSON logs. Every HTTP request has an
`x-request-id` response header and a request span containing its request ID,
method, route, client and peer IPs, Fly region, status, latency, body sizes,
authentication result, concurrency, and database/connection open or reuse
context where applicable. Each SQL statement emits one terminal event after it
completes, fails, or is cancelled. That event includes the statement text,
operation and fingerprint, parameter count, total and phase timings, returned
row/column counts, affected-row count, transaction/rollback state, and current
queue pressure; parameter values are intentionally not logged. Because SQL
literals are part of the statement text, avoid putting secrets directly in SQL
and use parameters instead. A periodic service-state event reports open
database/connection counts, query pressure, database and WAL sizes, and free
filesystem space. Use `RUST_LOG` to adjust filtering, for example
`RUST_LOG=tursod=debug`.

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
