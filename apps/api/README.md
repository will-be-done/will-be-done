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
pnpm openapi:check
```
