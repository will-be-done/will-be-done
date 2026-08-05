import { readdir } from "node:fs/promises";
import path from "node:path";
import { createClient as createTursoApiClient } from "@tursodatabase/api";
import { Database } from "bun:sqlite";
import * as dotenv from "dotenv";
import {
  buildTursoDatabaseName,
  type TursoDatabaseFileType,
} from "./turso";

dotenv.config();

type MigrationSource = {
  filePath: string;
  databaseName: string;
  databaseType: TursoDatabaseFileType;
};

type UploadDatabaseResponse = {
  database?: {
    Hostname?: string;
    hostname?: string;
  };
};

const requireEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const errorStatus = (error: unknown): number | undefined => {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
};

const parseDatabaseFile = (
  directory: string,
  filename: string,
  prefix: string,
): MigrationSource | undefined => {
  if (!filename.endsWith(".sqlite")) return undefined;

  const basename = filename.slice(0, -".sqlite".length);
  const separator = basename.indexOf("-");
  if (separator < 1) return undefined;

  const databaseType = basename.slice(0, separator);
  const databaseId = basename.slice(separator + 1);
  if (
    !databaseId ||
    (databaseType !== "main" &&
      databaseType !== "user" &&
      databaseType !== "space")
  ) {
    return undefined;
  }

  return {
    filePath: path.join(directory, filename),
    databaseName: buildTursoDatabaseName(
      prefix,
      databaseType,
      databaseId,
    ),
    databaseType,
  };
};

const readPragmaValue = (database: Database, pragma: string): unknown => {
  const row = database.query(`PRAGMA ${pragma}`).get() as
    | Record<string, unknown>
    | undefined;
  return row && Object.values(row)[0];
};

const prepareDatabaseFile = (source: MigrationSource): void => {
  const database = new Database(source.filePath, { strict: true });
  try {
    database.run("PRAGMA journal_mode = WAL");
    database.run("PRAGMA wal_checkpoint(TRUNCATE)");

    const requirements: Array<[string, unknown]> = [
      ["journal_mode", "wal"],
      ["page_size", 4096],
      ["auto_vacuum", 0],
      ["encoding", "UTF-8"],
      ["quick_check", "ok"],
    ];
    for (const [pragma, expected] of requirements) {
      const actual = readPragmaValue(database, pragma);
      if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
        throw new Error(
          `${source.filePath}: PRAGMA ${pragma} must be ${expected}, received ${String(actual)}`,
        );
      }
    }
  } finally {
    database.close();
  }
};

const createUploadDatabase = async (
  source: MigrationSource,
  config: { org: string; token: string; group: string },
): Promise<string> => {
  const response = await fetch(
    `https://api.turso.tech/v1/organizations/${encodeURIComponent(config.org)}/databases`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: source.databaseName,
        group: config.group,
        seed: { type: "database_upload" },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not create ${source.databaseName}: ${response.status} ${await response.text()}`,
    );
  }

  const result = (await response.json()) as UploadDatabaseResponse;
  const hostname =
    result.database?.Hostname ?? result.database?.hostname;
  if (!hostname) {
    throw new Error(
      `Turso did not return a hostname for ${source.databaseName}`,
    );
  }
  return hostname;
};

const uploadDatabaseFile = async (
  source: MigrationSource,
  hostname: string,
  databaseToken: string,
): Promise<void> => {
  const file = Bun.file(source.filePath);
  const response = await fetch(`https://${hostname}/v1/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${databaseToken}`,
      "Content-Length": String(file.size),
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(
      `Could not upload ${source.filePath}: ${response.status} ${await response.text()}`,
    );
  }
};

const argumentValue = (name: string): string | undefined => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
};

const run = async (): Promise<void> => {
  const execute = Bun.argv.includes("--execute");
  const dbPath =
    argumentValue("--db-path") ??
    process.env.WBD_DB_PATH ??
    path.join(
      process.env.WBD_STORAGE_PATH ?? "/var/lib/will-be-done",
      "db",
    );
  const org = requireEnvironmentVariable("WBD_TURSO_ORG");
  const token = requireEnvironmentVariable("WBD_TURSO_PLATFORM_TOKEN");
  const group = process.env.WBD_TURSO_GROUP?.trim() || "default";
  const prefix = process.env.WBD_TURSO_DATABASE_PREFIX?.trim() || "wbd";

  const sources = (await readdir(dbPath))
    .map((filename) => parseDatabaseFile(dbPath, filename, prefix))
    .filter((source): source is MigrationSource => source !== undefined)
    .sort((left, right) =>
      left.databaseType === "main"
        ? -1
        : right.databaseType === "main"
          ? 1
          : left.databaseName.localeCompare(right.databaseName),
    );
  if (sources.length === 0) {
    throw new Error(`No main-, user-, or space-*.sqlite files found in ${dbPath}`);
  }

  const names = new Set<string>();
  for (const source of sources) {
    if (names.has(source.databaseName)) {
      throw new Error(`Duplicate Turso database name: ${source.databaseName}`);
    }
    names.add(source.databaseName);
    prepareDatabaseFile(source);
  }

  console.log(`Validated ${sources.length} SQLite database(s) in ${dbPath}:`);
  for (const source of sources) {
    console.log(`  ${path.basename(source.filePath)} -> ${source.databaseName}`);
  }

  if (!execute) {
    console.log(
      "Dry run only. Stop the API and rerun with --execute to create and upload the Turso databases.",
    );
    return;
  }

  const turso = createTursoApiClient({ org, token });
  for (const source of sources) {
    try {
      await turso.databases.get(source.databaseName);
      throw new Error(
        `Refusing to overwrite existing Turso database ${source.databaseName}`,
      );
    } catch (error) {
      if (errorStatus(error) !== 404) throw error;
    }
  }

  let mainDatabaseUrl: string | undefined;
  const createdDatabaseNames: string[] = [];
  try {
    for (const source of sources) {
      console.log(`Creating ${source.databaseName}...`);
      const hostname = await createUploadDatabase(source, {
        org,
        token,
        group,
      });
      createdDatabaseNames.push(source.databaseName);
      const { jwt } = await turso.databases.createToken(source.databaseName, {
        authorization: "full-access",
        expiration: "1h",
      });
      await uploadDatabaseFile(source, hostname, jwt);
      console.log(`Uploaded ${path.basename(source.filePath)}.`);
      if (source.databaseType === "main") {
        mainDatabaseUrl = `libsql://${hostname}`;
      }
    }
  } catch (error) {
    for (const databaseName of createdDatabaseNames.reverse()) {
      try {
        await turso.databases.delete(databaseName);
        console.error(`Removed incomplete database ${databaseName}.`);
      } catch (cleanupError) {
        console.error(
          `Could not remove incomplete database ${databaseName}:`,
          cleanupError,
        );
      }
    }
    throw error;
  }

  console.log("Migration complete. Configure the API with:");
  console.log("  WBD_DB_ENGINE=turso");
  if (mainDatabaseUrl) {
    console.log(`  WBD_TURSO_MAIN_DATABASE_URL=${mainDatabaseUrl}`);
  }
  console.log(
    `  WBD_TURSO_AUTH_TOKEN=<full-access token for the ${group} group>`,
  );
};

await run();
