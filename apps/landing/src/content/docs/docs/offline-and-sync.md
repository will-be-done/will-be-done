---
title: Offline and sync
description: What stays on your device, how synchronization works, and how conflicting changes merge.
sidebar:
  order: 4
---

## Data on your device

Will Be Done keeps a local database on each device. Task edits apply locally
without waiting for the server, and your tasks remain available locally when
the connection drops.

Each device needs to sign in and sync while connected before it can use your
existing data offline. Opening the app on a new device requires a connection.

## Working offline

Once the app and your data are available locally, you can create and edit tasks,
complete them, change their schedule, organize projects, and use Stash offline.
Changes remain on that device until it can reconnect.

Account actions, Todoist imports, and HTTP API requests need a reachable server.
An API script talks to the server's copy of your data; it cannot read edits
that are still only on an offline device.

The web app caches its application files for offline use. An
[installed PWA](/docs/install/#install-the-web-app) uses the same offline support.
Installation does not replace the initial sign-in and sync.

## Reconnection and other devices

When the server becomes reachable, the app sends local changes and receives
changes from other devices. Connected devices update without a manual page
reload. Open tabs also exchange local changes.

If your self-hosted server goes offline, devices with local data keep working.
They cannot exchange changes through that server until it returns. Keep the
app open after reconnecting so synchronization can finish before switching
devices.

## Conflicting changes

Sync merges a task's fields independently. If you change the title on your
phone and the description on your desktop while both are offline, both edits
can survive.

If both devices change the same field, the edit ordered later by the sync
clock wins. Reconnection order does not decide the winner. For example, a
phone's earlier title edit does not overwrite a later desktop title edit just
because the phone reconnects last.

Deleting a task records a deletion for other devices to receive. A stale edit
on another device does not recreate the deleted task.

## Local storage and backups

Browser data belongs to the browser profile and server address you use.
Another browser, profile, or server address has separate local storage and
needs its own sign-in and sync.

Clearing site data removes that local copy, including edits that have not
reached the server. Keep site data while working offline. Before clearing it,
reconnect and sync, or export the space through **Space Settings → Backup**.

Sync keeps devices up to date, including deletions. Backups preserve a copy you
can restore later. See [space backups](/docs/features/#imports-and-space-backups).

## App updates

When **New version available** appears, select **Reload** to use the new
version. A sync protocol update can require a client update. In that case,
the app shows **Update required** and pauses sync until you select **Update**.
