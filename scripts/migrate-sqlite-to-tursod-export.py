#!/usr/bin/env python3
"""Create clean SQLite snapshots named for apps/tursod's database contract."""

from __future__ import annotations

import argparse
from contextlib import closing
import csv
import hashlib
import os
import re
import sqlite3
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path


UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
TURSOD_NAME_RE = re.compile(r"[A-Za-z0-9_-]{1,128}")


@dataclass(frozen=True)
class Mapping:
    source: Path
    target: str
    classification: str


def map_database(source: Path) -> Mapping:
    name = source.name
    if name == "main-main.sqlite":
        target = "main-main.db"
        classification = "active-main"
    elif name == "main.sqlite":
        target = "legacy-main.db"
        classification = "legacy-main-preserved-only"
    elif name.endswith(".sqlite") and (
        name.startswith("user-") or name.startswith("space-")
    ):
        target = f"{name.removesuffix('.sqlite')}.db"
        classification = "active"
    elif name.endswith(".sqlite") and UUID_RE.fullmatch(
        name.removesuffix(".sqlite")
    ):
        target = f"space-{name.removesuffix('.sqlite')}.db"
        classification = "legacy-space"
    else:
        raise ValueError(f"unsupported SQLite database name: {name}")

    target_stem = target.removesuffix(".db")
    if not TURSOD_NAME_RE.fullmatch(target_stem):
        raise ValueError(f"target name is not accepted by apps/tursod: {target}")

    return Mapping(source=source, target=target, classification=classification)


def mappings_for(source_dir: Path) -> list[Mapping]:
    if not source_dir.is_dir():
        raise ValueError(f"source directory does not exist: {source_dir}")

    mappings = [map_database(path) for path in sorted(source_dir.glob("*.sqlite"))]
    if not mappings:
        raise ValueError(f"no .sqlite databases found in {source_dir}")

    targets: dict[str, Path] = {}
    for mapping in mappings:
        existing = targets.get(mapping.target)
        if existing is not None:
            raise ValueError(
                f"target collision: {existing.name} and {mapping.source.name} both map "
                f"to {mapping.target}"
            )
        targets[mapping.target] = mapping.source

    if "main-main.db" not in targets:
        raise ValueError("main-main.sqlite is required but was not found")

    return mappings


def connect_readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)


def quick_check(connection: sqlite3.Connection, source: Path) -> None:
    rows = connection.execute("PRAGMA quick_check").fetchall()
    results = [str(row[0]) for row in rows]
    if results != ["ok"]:
        raise ValueError(f"SQLite quick_check failed for {source}: {results}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def print_plan(mappings: list[Mapping]) -> None:
    total_bytes = 0
    for mapping in mappings:
        with closing(connect_readonly(mapping.source)) as connection:
            quick_check(connection, mapping.source)
        size = mapping.source.stat().st_size
        total_bytes += size
        print(
            f"{mapping.source.name}\t{mapping.target}\t"
            f"{mapping.classification}\t{size}"
        )

    print(
        f"Databases: {len(mappings)}; base-file bytes: {total_bytes}",
        file=sys.stderr,
    )


def export(mappings: list[Mapping]) -> Path:
    archive_fd, archive_name = tempfile.mkstemp(
        prefix="wbd-tursod-migration-", suffix=".tar.gz"
    )
    os.close(archive_fd)
    archive_path = Path(archive_name)

    try:
        with tempfile.TemporaryDirectory(prefix="wbd-tursod-export-") as temp_name:
            export_dir = Path(temp_name)
            manifest_rows: list[tuple[str, str, str, int, str]] = []

            for index, mapping in enumerate(mappings, start=1):
                target_path = export_dir / mapping.target
                print(
                    f"[{index}/{len(mappings)}] {mapping.source.name} -> "
                    f"{mapping.target} ({mapping.classification})",
                    file=sys.stderr,
                )

                with closing(connect_readonly(mapping.source)) as source_connection:
                    with closing(
                        sqlite3.connect(target_path, timeout=30)
                    ) as target_connection:
                        source_connection.backup(target_connection)
                        quick_check(target_connection, mapping.source)
                        journal_mode = target_connection.execute(
                            "PRAGMA journal_mode=DELETE"
                        ).fetchone()[0]
                        if str(journal_mode).lower() != "delete":
                            raise ValueError(
                                f"failed to make a standalone snapshot of {mapping.source}"
                            )
                        target_connection.commit()

                target_path.with_name(f"{target_path.name}-wal").unlink(missing_ok=True)
                target_path.with_name(f"{target_path.name}-shm").unlink(missing_ok=True)

                digest = sha256(target_path)
                manifest_rows.append(
                    (
                        mapping.source.name,
                        mapping.target,
                        mapping.classification,
                        target_path.stat().st_size,
                        digest,
                    )
                )

            manifest_path = export_dir / "manifest.tsv"
            with manifest_path.open("w", encoding="utf-8", newline="") as file:
                writer = csv.writer(file, delimiter="\t", lineterminator="\n")
                writer.writerow(
                    ["source", "target", "classification", "bytes", "sha256"]
                )
                writer.writerows(manifest_rows)

            checksums_path = export_dir / "checksums.sha256"
            with checksums_path.open("w", encoding="ascii") as file:
                for _, target, _, _, digest in manifest_rows:
                    file.write(f"{digest}  {target}\n")

            with tarfile.open(archive_path, "w:gz") as archive:
                for path in sorted(export_dir.iterdir()):
                    archive.add(path, arcname=path.name, recursive=False)

        archive_path.chmod(0o600)
        return archive_path
    except BaseException:
        archive_path.unlink(missing_ok=True)
        raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["plan", "export"])
    parser.add_argument("source_dir", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        mappings = mappings_for(args.source_dir)
        if args.mode == "plan":
            print_plan(mappings)
        else:
            print(export(mappings))
        return 0
    except (OSError, sqlite3.Error, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
