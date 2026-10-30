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

## Enable SSO

You can connect one OpenID Connect provider to your server. The provider must
support discovery, the authorization code flow, PKCE with S256, and signed ID
tokens. Users must have a verified email address in the provider.

1. Create a confidential OpenID Connect client in your identity provider.
   Enable the `openid` and `email` scopes. Use `client_secret_post` for client
   authentication.
2. Register your server's callback URL. For example:

   ```text
   https://tasks.example.com/api/auth/oidc/callback
   ```

   Browser and desktop sign-in use the same callback. Desktop sign-in opens
   your provider in the system browser.

3. Add these variables to your container's environment:

   ```yaml
   environment:
     WBD_OIDC_ISSUER: https://identity.example.com/realms/tasks
     WBD_OIDC_CLIENT_ID: will-be-done
     WBD_OIDC_CLIENT_SECRET: ${WBD_OIDC_CLIENT_SECRET}
     WBD_OIDC_PUBLIC_APP_URL: https://tasks.example.com
     WBD_OIDC_NAME: Company SSO
   ```

   Set `WBD_OIDC_CLIENT_SECRET` through your deployment's secret manager or
   Compose environment file. Keep it out of browser configuration.
   `WBD_OIDC_ISSUER` is the issuer URL from your provider, not its discovery
   document URL. `WBD_OIDC_PUBLIC_APP_URL` is the exact origin you open in the
   browser, without a path. Both URLs require HTTPS, except on localhost.

4. Recreate your container with the new environment. Select **Continue with
   Company SSO** on the sign-in page. A new identity creates an account when
   you first sign in. Email/password signup and sign-in remain available.

To connect an existing account, sign in with its current method. Open **Account
settings**, select **Connect SSO**, finish signing in with your provider, and
confirm the connection with your app password. Matching email addresses do not
connect accounts automatically. If your account has no password, use email
recovery to set one before you connect SSO.

To disconnect SSO, confirm your app email and password, then select **Disconnect
SSO** in Account settings. Keep a working sign-in method for the account.

Existing app sessions and API tokens remain valid. Removing a user from your
identity provider prevents future SSO sign-ins. To end existing access, revoke
that user's app tokens. Signing out of Will Be Done leaves the identity
provider's session active.

To disable SSO, remove all `WBD_OIDC_*` variables and recreate the container.
Keep the same storage volume so accounts and their data remain available.

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
