---
title: Install the app
description: Install Will Be Done on desktop or as a progressive web app on your phone or computer.
sidebar:
  order: 5
---

You can use Will Be Done in a browser, as an installed web app, or through the
desktop app. All clients connect to the cloud or your self-hosted server.

## Install the desktop app

1. Open the [desktop releases](https://github.com/will-be-done/will-be-done/releases).
2. Download the package for your operating system: Windows, macOS, or Linux.
3. Install and launch Will Be Done.
4. Set **Server URL** to `https://app.will-be-done.app` or your self-hosted server's base URL.
5. Connect and sign in to that server.

Use the base URL, such as `https://tasks.example.com`, without `/api` or
`/docs`. The desktop app checks that the address is a Will Be Done server.

The desktop app adds a system tray and a global quick-add shortcut. See
[desktop quick add](/docs/keyboard-shortcuts/#desktop-quick-add), including
the Wayland configuration for Linux.

## Install the web app

A progressive web app, or PWA, adds Will Be Done to your home screen or app
launcher and opens it in its own window. It uses the same web app and server.

Open the [cloud app](https://app.will-be-done.app) or your self-hosted app to
install it. Install the app itself, rather than this documentation site.

### iPhone and iPad

1. Open your Will Be Done server in Safari.
2. Open the share menu.
3. Select **Add to Home Screen**.
4. If **Open as Web App** is shown, turn it on.
5. Select **Add**.
6. Open Will Be Done from the home screen and sign in if prompted.

Apple's [Safari web app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)
show where to find the home screen option.

### Android

1. Open your Will Be Done server in Chrome.
2. Open the browser menu.
3. Select **Install and create shortcut**, then **Install**. In some versions, the option is **Add to Home screen** or **Install app**.
4. Follow the installation prompt.
5. Open Will Be Done from your home screen or app launcher.

See Google's [Chrome web app instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en)
for the current menu names.

### Desktop browser

1. Open your Will Be Done server in Chrome.
2. Select the install icon in the address bar, or open **More → Cast, save, and share → Install page as app**.
3. Confirm installation.

See Google's [desktop web app instructions](https://support.google.com/chrome/answer/9658361?hl=en)
if the install icon is absent.

### Self-hosted installation

For browser PWA installation, serve your app over HTTPS. Browsers also allow
`http://localhost:3000` when they run on the server's computer. See the
[PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable#https_localhost_or_loopback_are_required).

## Prepare for offline use

1. Open the app while connected.
2. Sign in and let your data sync.
3. Open it without a connection to check that your tasks are available.

For reconnecting, local storage, and app updates, read
[Offline and sync](/docs/offline-and-sync/).
