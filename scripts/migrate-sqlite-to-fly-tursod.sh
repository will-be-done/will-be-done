#!/usr/bin/env bash
set -Eeuo pipefail

# flyctl telemetry is nonessential and can otherwise turn a successful command
# into a failure when its metrics endpoint times out.
export FLY_SEND_METRICS=false

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_HELPER="$SCRIPT_DIR/migrate-sqlite-to-tursod-export.py"
INSTALL_HELPER="$SCRIPT_DIR/migrate-sqlite-to-fly-tursod-install.sh"

SOURCE_SSH="root@37.120.186.194"
SOURCE_DB_DIR="/var/lib/docker/volumes/will_be_done_storage/_data"
APP_NAME="wbd-app-prod"
TURSOD_APP_NAME="wbd-tursod-prod"
EXECUTE=false
KEEP_WORK_DIR=false

WORK_DIR=""
REMOTE_SOURCE_ARCHIVE=""
MIGRATION_COMPLETE=false
TARGET_SWAP_STARTED=false
TARGET_READY=false
APP_RUNNING_IDS=()

usage() {
  cat <<'EOF'
Usage: scripts/migrate-sqlite-to-fly-tursod.sh [options]

By default, validates every source SQLite database and prints the name mapping.
Pass --execute to create clean online SQLite snapshots, download them locally,
and replace the database files on wbd-tursod-prod's /data volume.

Options:
  --execute                 Perform the Fly volume import.
  --keep-work-dir           Keep the downloaded archive and checksums.
  --source SSH_TARGET       Source SSH target (default: root@37.120.186.194).
  --source-dir PATH         Source database directory.
  --app APP                 Fly web app to stop during import.
  --tursod-app APP          Fly tursod app whose volume receives the import.
  -h, --help                Show this help.

The online SQLite backup API includes committed WAL data without copying SQLite
WAL/SHM sidecars. For an exact cross-database cutover point, stop writes on the
source application before running with --execute.
EOF
}

log() {
  printf '[sqlite-to-tursod] %s\n' "$*"
}

die() {
  printf '[sqlite-to-tursod] error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

start_original_app_machines() {
  local machine_id
  for machine_id in "${APP_RUNNING_IDS[@]}"; do
    log "Starting original app Machine $machine_id"
    fly machine start "$machine_id" --app "$APP_NAME" >/dev/null || true
  done
}

wait_for_tursod_health() {
  local machines_json

  for _ in {1..60}; do
    machines_json="$(fly machine list --app "$TURSOD_APP_NAME" --json)"
    if jq -e --arg machine "$TURSOD_MACHINE_ID" '
        any(.id == $machine and .state == "started" and
          (.checks | length > 0 and all(.status == "passing")))
      ' <<< "$machines_json" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  return 1
}

cleanup() {
  local status=$?
  trap - EXIT

  if [[ "$status" -ne 0 && ${#APP_RUNNING_IDS[@]} -gt 0 ]]; then
    if [[ "$TARGET_SWAP_STARTED" == true && "$TARGET_READY" != true ]]; then
      printf '%s\n' \
        '[sqlite-to-tursod] target swap did not finish; leaving app Machines stopped' \
        >&2
    else
      start_original_app_machines
    fi
  fi

  if [[ -n "$REMOTE_SOURCE_ARCHIVE" && "$REMOTE_SOURCE_ARCHIVE" == /tmp/wbd-tursod-migration-*.tar.gz ]]; then
    ssh "$SOURCE_SSH" "rm -f -- '$REMOTE_SOURCE_ARCHIVE'" >/dev/null 2>&1 || true
  fi

  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    if [[ "$KEEP_WORK_DIR" == true ]]; then
      log "Kept work directory: $WORK_DIR"
    elif [[ "$WORK_DIR" == */wbd-tursod-migration.* ]]; then
      rm -rf -- "$WORK_DIR"
    else
      printf '[sqlite-to-tursod] refusing to remove unexpected work directory: %s\n' \
        "$WORK_DIR" >&2
      status=1
    fi
  fi

  exit "$status"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      EXECUTE=true
      shift
      ;;
    --keep-work-dir)
      KEEP_WORK_DIR=true
      shift
      ;;
    --source)
      [[ $# -ge 2 ]] || die "--source requires a value"
      SOURCE_SSH="$2"
      shift 2
      ;;
    --source-dir)
      [[ $# -ge 2 ]] || die "--source-dir requires a value"
      SOURCE_DB_DIR="$2"
      shift 2
      ;;
    --app)
      [[ $# -ge 2 ]] || die "--app requires a value"
      APP_NAME="$2"
      shift 2
      ;;
    --tursod-app)
      [[ $# -ge 2 ]] || die "--tursod-app requires a value"
      TURSOD_APP_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

trap cleanup EXIT

require_command ssh
[[ -f "$EXPORT_HELPER" ]] || die "export helper not found: $EXPORT_HELPER"
[[ -f "$INSTALL_HELPER" ]] || die "install helper not found: $INSTALL_HELPER"

log "Validating source databases and planned tursod names"
ssh "$SOURCE_SSH" "python3 - plan '$SOURCE_DB_DIR'" < "$EXPORT_HELPER"

if [[ "$EXECUTE" != true ]]; then
  log "Dry run complete. Re-run with --execute to import into Fly."
  exit 0
fi

require_command fly
require_command awk
require_command curl
require_command gzip
require_command jq
require_command scp
require_command sha256sum
require_command tar

WORK_DIR="$(mktemp -d -t wbd-tursod-migration.XXXXXXXX)"
MIGRATION_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="wbd-tursod-migration-$MIGRATION_ID.tar.gz"
CHECKSUM_NAME="$ARCHIVE_NAME.sha256"
LOCAL_ARCHIVE="$WORK_DIR/$ARCHIVE_NAME"
LOCAL_CHECKSUM="$WORK_DIR/$CHECKSUM_NAME"

log "Creating clean SQLite snapshots on $SOURCE_SSH"
REMOTE_SOURCE_ARCHIVE="$(
  ssh "$SOURCE_SSH" "python3 - export '$SOURCE_DB_DIR'" < "$EXPORT_HELPER"
)"
[[ "$REMOTE_SOURCE_ARCHIVE" == /tmp/wbd-tursod-migration-*.tar.gz ]] \
  || die "unexpected remote archive path: $REMOTE_SOURCE_ARCHIVE"

log "Downloading source archive to $LOCAL_ARCHIVE"
scp "$SOURCE_SSH:$REMOTE_SOURCE_ARCHIVE" "$LOCAL_ARCHIVE"
ssh "$SOURCE_SSH" "rm -f -- '$REMOTE_SOURCE_ARCHIVE'"
REMOTE_SOURCE_ARCHIVE=""

gzip -t "$LOCAL_ARCHIVE"
tar -tzf "$LOCAL_ARCHIVE" | awk '
  {
    surrounded = "/" $0 "/"
    if (substr($0, 1, 1) == "/" || index(surrounded, "/../") != 0) {
      exit 1
    }
  }
'
(
  cd "$WORK_DIR"
  sha256sum "$ARCHIVE_NAME" > "$CHECKSUM_NAME"
)

TURSOD_MACHINES_JSON="$(fly machine list --app "$TURSOD_APP_NAME" --json)"
mapfile -t TURSOD_MACHINE_IDS < <(
  jq -r '.[] | select(.state != "destroyed") | .id' <<< "$TURSOD_MACHINES_JSON"
)
[[ ${#TURSOD_MACHINE_IDS[@]} -eq 1 ]] \
  || die "$TURSOD_APP_NAME must have exactly one Machine; found ${#TURSOD_MACHINE_IDS[@]}"
TURSOD_MACHINE_ID="${TURSOD_MACHINE_IDS[0]}"

VOLUMES_JSON="$(fly volumes list --app "$TURSOD_APP_NAME" --json)"
mapfile -t VOLUME_IDS < <(
  jq -r --arg machine "$TURSOD_MACHINE_ID" \
    '.[] | select(.name == "tursod_data" and .attached_machine_id == $machine) | .id' \
    <<< "$VOLUMES_JSON"
)
[[ ${#VOLUME_IDS[@]} -eq 1 ]] \
  || die "expected one attached tursod_data volume; found ${#VOLUME_IDS[@]}"
VOLUME_ID="${VOLUME_IDS[0]}"

APP_MACHINES_JSON="$(fly machine list --app "$APP_NAME" --json)"
mapfile -t APP_MACHINE_IDS < <(
  jq -r '.[] | select(.state != "destroyed") | .id' <<< "$APP_MACHINES_JSON"
)
mapfile -t APP_RUNNING_IDS < <(
  jq -r '.[] | select(.state == "started" or .state == "starting") | .id' \
    <<< "$APP_MACHINES_JSON"
)
if [[ ${#APP_RUNNING_IDS[@]} -eq 0 && ${#APP_MACHINE_IDS[@]} -gt 0 ]]; then
  APP_RUNNING_IDS=("${APP_MACHINE_IDS[0]}")
  log "All app Machines are already stopped; one will be restored after import"
fi

log "Scheduling a pre-import snapshot of volume $VOLUME_ID"
fly volumes snapshots create "$VOLUME_ID" --app "$TURSOD_APP_NAME"

for machine_id in "${APP_RUNNING_IDS[@]}"; do
  log "Stopping app Machine $machine_id"
  fly machine stop "$machine_id" --app "$APP_NAME"
done

for _ in {1..30}; do
  APP_MACHINES_JSON="$(fly machine list --app "$APP_NAME" --json)"
  if jq -e 'all(.state == "stopped")' <<< "$APP_MACHINES_JSON" >/dev/null; then
    break
  fi
  sleep 1
done
jq -e 'all(.state == "stopped")' <<< "$APP_MACHINES_JSON" >/dev/null \
  || die "not all $APP_NAME Machines stopped"

log "Restarting tursod to close all pre-import database handles"
if ! fly machine restart "$TURSOD_MACHINE_ID" --app "$TURSOD_APP_NAME"; then
  log "Fly did not observe restart health in time; checking Machine health directly"
fi
wait_for_tursod_health || die "tursod health check did not become healthy"

# The web app has autostart enabled. Abort if an unexpected request restarted it.
APP_MACHINES_JSON="$(fly machine list --app "$APP_NAME" --json)"
jq -e 'all(.state == "stopped")' <<< "$APP_MACHINES_JSON" >/dev/null \
  || die "$APP_NAME restarted during migration preparation"

log "Uploading migration archive to tursod Machine $TURSOD_MACHINE_ID"
fly sftp put "$LOCAL_ARCHIVE" "/tmp/$ARCHIVE_NAME" \
  --app "$TURSOD_APP_NAME" --machine "$TURSOD_MACHINE_ID"
fly sftp put "$LOCAL_CHECKSUM" "/tmp/$CHECKSUM_NAME" \
  --app "$TURSOD_APP_NAME" --machine "$TURSOD_MACHINE_ID"
REMOTE_INSTALLER="/tmp/wbd-tursod-install-$MIGRATION_ID.sh"
fly sftp put "$INSTALL_HELPER" "$REMOTE_INSTALLER" \
  --app "$TURSOD_APP_NAME" --machine "$TURSOD_MACHINE_ID"

REMOTE_BACKUP_DIR="/data/.pre-migration-$MIGRATION_ID"
REMOTE_MANIFEST="/data/.migration-manifest-$MIGRATION_ID.tsv"

log "Replacing tursod database files; previous files move to $REMOTE_BACKUP_DIR"
TARGET_SWAP_STARTED=true
fly ssh console --app "$TURSOD_APP_NAME" --machine "$TURSOD_MACHINE_ID" \
  -C "/bin/sh $REMOTE_INSTALLER $ARCHIVE_NAME $MIGRATION_ID"

log "Restarting tursod on the imported databases"
if ! fly machine restart "$TURSOD_MACHINE_ID" --app "$TURSOD_APP_NAME"; then
  log "Fly did not observe restart health in time; checking Machine health directly"
fi
wait_for_tursod_health || die "tursod health check did not become healthy"
TARGET_READY=true

start_original_app_machines
APP_RUNNING_IDS=()

log "Waiting for the production app health endpoint"
for _ in {1..30}; do
  if curl --fail --silent --show-error \
    "https://$APP_NAME.fly.dev/api/health" >/dev/null; then
    MIGRATION_COMPLETE=true
    break
  fi
  sleep 1
done
[[ "$MIGRATION_COMPLETE" == true ]] || die "production app health check failed"

log "Migration complete"
log "Previous target files: $REMOTE_BACKUP_DIR"
log "Imported manifest: $REMOTE_MANIFEST"
