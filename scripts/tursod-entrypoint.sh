#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  # Fly volumes replace the image-owned /data directory at mount time. Repair
  # ownership before dropping privileges so an existing volume stays writable.
  chown -R tursod:tursod "${TURSOD_DB_PATH:-/data}"
  exec gosu tursod "$@"
fi

exec "$@"
