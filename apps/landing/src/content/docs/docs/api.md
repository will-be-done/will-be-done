---
title: API
description: Create an API token, send requests, find the endpoint reference, and generate an SDK for your language.
sidebar:
  order: 6
---

Use the HTTP API to connect scripts and integrations to your server. It covers
spaces, projects, sections, tasks, recurring templates, checklists, schedules,
and Stash. Requests use the server's data and require a network connection.

## Open the API reference

The generated reference lists endpoints, request fields, responses, and
pagination options:

- Cloud: [interactive API reference](https://app.will-be-done.app/api/docs).
- Self-hosted: open `/api/docs` on your server, such as [http://localhost:3000/api/docs](http://localhost:3000/api/docs).
- OpenAPI schema: open `/api/openapi.json` on the same server, or download the [cloud schema](https://app.will-be-done.app/api/openapi.json).

Open the interactive reference in the same browser and on the same server
where you signed in to reuse the app's saved session token. Otherwise, enter
your API token in the reference's **Authentication** controls.

## Generate an SDK for your language

The API uses OpenAPI, so you can generate a client SDK for your preferred
language. OpenAPI Generator supports TypeScript, Python, Go, Java, and other
languages through its [client generators](https://openapi-generator.tech/docs/generators/).

1. Choose a client generator for your language.
2. Use your server's `/api/openapi.json` as the input schema, such as `https://app.will-be-done.app/api/openapi.json` for the cloud.
3. Follow the [generation instructions](https://openapi-generator.tech/docs/usage/#generate) and the generated project's README to build and install the SDK.
4. Configure the client with your server's base URL and API token for Bearer authentication.

Use the schema from the server your integration calls so the generated SDK
matches that server's API version. Regenerate it when you need to use API
changes from a newer release.

## Create a token

1. Sign in and open a space.
2. Open **Space Settings**.
3. Select **Tokens**.
4. Select **Create token**.
5. Copy the token and store it securely.

Tokens authenticate your account, including access to its spaces. Opening the
token settings from a space does not limit the token to that space. Treat a
token as a password. Tokens stay active until you delete them.

## List your spaces

Set your server address and token in a terminal:

```sh
WBD_SERVER_URL="https://app.will-be-done.app"
WBD_API_TOKEN="YOUR_TOKEN"
```

For self-hosting, replace the address with your server's base URL, such as
`http://localhost:3000` or `https://tasks.example.com`.

Send the token in the `Authorization` header:

```sh
curl --fail-with-body \
	-H "Authorization: Bearer $WBD_API_TOKEN" \
	"$WBD_SERVER_URL/api/v1/spaces"
```

The response has a `spaces` array. Copy the `id` of the space you want to use
for the next request. Each token belongs to the server where you created it.
A cloud token does not authenticate with a separate self-hosted server.

## Create a task in Stash

Set the space ID from the previous response:

```sh
WBD_SPACE_ID="YOUR_SPACE_ID"
```

Create a task with a JSON request:

```sh
curl --fail-with-body \
	-X POST \
	-H "Authorization: Bearer $WBD_API_TOKEN" \
	-H "Content-Type: application/json" \
	-d '{"title":"Review the weekly plan"}' \
	"$WBD_SERVER_URL/api/v1/spaces/$WBD_SPACE_ID/stash/tasks"
```

The server creates the task in the inbox and adds it to Stash. Connected
clients receive the change through sync.


## Revoke a token

1. Open **Space Settings → Tokens**.
2. Delete the token used by the integration.
3. Confirm deletion.

Requests with that token stop working. Deleting the token marked as your
current session also signs you out. To replace an integration's token, create
a new token and update the integration before deleting the old one.
