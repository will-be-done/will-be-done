---
title: Self-hosting
description: Run Will Be Done with Docker, manage persistent storage, and update the server.
sidebar:
  order: 3
---

The standard server runs in one Docker container. It serves the web app and API
on port 3000 and stores data in SQLite. It needs no external database service.
Install [Docker Engine](https://docs.docker.com/engine/install/) or
[Docker Desktop](https://docs.docker.com/desktop/) before continuing.

## Start the server

Choose either the Docker command or Docker Compose.

### Docker command

Run this command on your server:

```sh
docker run -d \
	--name will-be-done \
	-p 3000:3000 \
	-v will_be_done_storage:/var/lib/will-be-done \
	--restart unless-stopped \
	ghcr.io/will-be-done/will-be-done:latest
```

### Docker Compose

Save this configuration as `docker-compose.yml`:

```yaml title="docker-compose.yml"
services:
  will-be-done:
    image: ghcr.io/will-be-done/will-be-done:latest
    container_name: will-be-done
    ports:
      - "3000:3000"
    volumes:
      - will_be_done_storage:/var/lib/will-be-done
    restart: unless-stopped

volumes:
  will_be_done_storage:
    name: will_be_done_storage
```

From the directory containing `docker-compose.yml`, start the server:

```sh
docker compose up -d
```

The explicit volume name keeps storage at `will_be_done_storage`, regardless
of the directory containing the Compose file.

## Open the app

Open [http://localhost:3000](http://localhost:3000) on the same computer and
create an account. For another device, use your server's address.

For HTTPS access, put a reverse proxy in front of port 3000 and allow WebSocket
connections for sync. Use the resulting base URL in your browser or
[desktop app](/docs/install/).

## Calendar connections

The server fetches events from the calendars users connect, so it stores their
calendar passwords and subscription links. They are encrypted with a key you
provide. Calendar connections stay off until you set it. Generate a key once,
for example with `openssl rand -base64 48`, and pass it to the container:

```sh
-e WBD_CALENDAR_ENCRYPTION_KEY=<your key>
```

With Docker Compose, add it under `environment:`. Keep the key stable: changing it makes saved connections unreadable, and users
have to add them again.

By default the server refuses calendar addresses on private networks. To use a
CalDAV server on your own network, such as Radicale or Nextcloud, also set
`WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS=true`. Only do this when you trust every
user of the server, since it lets them make the server request internal
addresses.

## Keep persistent storage

The named Docker volume `will_be_done_storage` holds the server's storage at
`/var/lib/will-be-done`. The default database directory is
`/var/lib/will-be-done/db`.

SQLite storage includes a main database and separate user and space databases.
Keep the whole volume when you replace a container. Removing the container
does not remove this named volume.

For a bind mount, replace the volume argument with an absolute directory on
your host, for example `-v /srv/will-be-done:/var/lib/will-be-done`.

The commands below assume the container and volume names from **Start the
server**. If you already have an installation, use its actual names and mounts.
Do not switch an existing installation to a new empty volume during an update.

Attached files are stored in `/var/lib/will-be-done/attachments` by default;
set `WBD_ATTACHMENTS_PATH` to use another directory. Back them up together with
the databases. To store files in S3-compatible storage instead, which several
server instances can share, set:

```sh
WBD_ATTACHMENTS_STORAGE=s3
WBD_ATTACHMENTS_S3_ACCESS_KEY_ID=your-access-key
WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY=your-secret-key
WBD_ATTACHMENTS_S3_BUCKET_NAME=will-be-done-attachments
WBD_ATTACHMENTS_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
WBD_ATTACHMENTS_S3_REGION=us-east-1
```

Back up each SQLite database manually, including before updates. Use SQLite's
`.backup` command to create consistent backup files while the server is running.
It includes committed changes from the WAL, so no separate checkpoint is needed.
See [SQLite's online backup documentation](https://www.sqlite.org/backup.html).

## Update the server

Read the [release notes](/releases/) and create a server backup first. Some
releases migrate stored data when databases open.

### Docker command

Pull the new image:

```sh
docker pull ghcr.io/will-be-done/will-be-done:latest
```

Stop and remove the old container, keeping its named volume:

```sh
docker stop will-be-done
docker rm will-be-done
```

Run the command in [Start the server](#start-the-server) again with the same
volume and any custom settings from your installation.

### Docker Compose

From the directory containing `docker-compose.yml`, pull the new image and
recreate the service:

```sh
docker compose pull
docker compose up -d
```

The service keeps its named storage volume. After updating, open the app and
check that your data is present.

For either installation method, you can use a version tag instead of `latest`
to control when you upgrade.
