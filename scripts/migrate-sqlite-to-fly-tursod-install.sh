#!/bin/sh
set -eu

ARCHIVE_NAME=${1:-}
MIGRATION_ID=${2:-}

case "$MIGRATION_ID" in
  ""|*[!0-9TZ]*)
    echo "invalid migration id: $MIGRATION_ID" >&2
    exit 1
    ;;
esac

EXPECTED_ARCHIVE="wbd-tursod-migration-$MIGRATION_ID.tar.gz"
if [ "$ARCHIVE_NAME" != "$EXPECTED_ARCHIVE" ]; then
  echo "unexpected archive name: $ARCHIVE_NAME" >&2
  exit 1
fi

CHECKSUM_NAME="$ARCHIVE_NAME.sha256"
IMPORT_DIR="/data/.migration-$MIGRATION_ID"
BACKUP_DIR="/data/.pre-migration-$MIGRATION_ID"
MANIFEST_PATH="/data/.migration-manifest-$MIGRATION_ID.tsv"
DB_CHECKSUMS_PATH="/data/.migration-checksums-$MIGRATION_ID.sha256"

cd /tmp
sha256sum -c "$CHECKSUM_NAME"
test ! -e "$IMPORT_DIR"
test ! -e "$BACKUP_DIR"
mkdir "$IMPORT_DIR" "$BACKUP_DIR"
tar -xzf "$ARCHIVE_NAME" -C "$IMPORT_DIR"

cd "$IMPORT_DIR"
sha256sum -c checksums.sha256

# The Turso engine can add sidecars such as .db-log. Preserve every existing
# top-level volume file so no old database state is mixed with the import.
for file in /data/* /data/.[!.]* /data/..?*; do
  if [ -f "$file" ]; then
    mv "$file" "$BACKUP_DIR/"
  fi
done

imported=0
for file in "$IMPORT_DIR"/*.db; do
  if [ -f "$file" ]; then
    mv "$file" /data/
    imported=$((imported + 1))
  fi
done
if [ "$imported" -eq 0 ]; then
  echo "migration archive contained no database files" >&2
  exit 1
fi

mv "$IMPORT_DIR/manifest.tsv" "$MANIFEST_PATH"
mv "$IMPORT_DIR/checksums.sha256" "$DB_CHECKSUMS_PATH"
rmdir "$IMPORT_DIR"
chown -R 10001:10001 /data
rm -f -- "/tmp/$ARCHIVE_NAME" "/tmp/$CHECKSUM_NAME"

printf 'Installed %s databases; previous files: %s\n' "$imported" "$BACKUP_DIR"
