use anyhow::{Context, ensure};
use rusqlite::{Connection, OpenFlags, config::DbConfig};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct SchemaRepairReport {
    pub(crate) removed_indexes: Vec<String>,
}

#[derive(Debug)]
struct MalformedIndex {
    row_id: i64,
    name: String,
}

pub(crate) fn repair_malformed_indexes(database_path: &Path) -> anyhow::Result<SchemaRepairReport> {
    if !database_path.exists() {
        return Ok(SchemaRepairReport::default());
    }

    let mut connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .with_context(|| {
        format!(
            "open SQLite database for schema preflight: {}",
            database_path.display()
        )
    })?;

    // This must happen before SQLite first parses sqlite_schema. Writable
    // schema mode makes malformed rows inspectable and causes SQLite to omit
    // them from PRAGMA table_list/index_list instead of rejecting the database.
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true)
        .context("disable automatic WAL checkpoint during schema preflight")?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, false)
        .context("disable defensive mode during schema preflight")?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_WRITABLE_SCHEMA, true)
        .context("enable malformed-schema inspection")?;
    connection
        .pragma_update(None, "writable_schema", true)
        .context("enable targeted sqlite_schema repair")?;

    let malformed_tables = malformed_table_names(&connection)?;
    ensure!(
        malformed_tables.is_empty(),
        "malformed SQLite table definitions require manual repair: {}",
        malformed_tables.join(", ")
    );

    let malformed_indexes = malformed_explicit_indexes(&connection)?;
    if malformed_indexes.is_empty() {
        return Ok(SchemaRepairReport::default());
    }

    let schema_version = connection
        .pragma_query_value(None, "schema_version", |row| row.get::<_, i64>(0))
        .context("read SQLite schema version before repair")?;
    let next_schema_version = schema_version
        .checked_add(1)
        .context("SQLite schema version overflow")?;

    let transaction = connection
        .transaction()
        .context("start malformed-index repair transaction")?;
    for index in &malformed_indexes {
        let removed = transaction
            .execute(
                "DELETE FROM sqlite_schema WHERE rowid = ?1 AND type = 'index' AND name = ?2 AND sql IS NOT NULL",
                (&index.row_id, &index.name),
            )
            .with_context(|| format!("delete malformed index {}", index.name))?;
        ensure!(
            removed == 1,
            "malformed index changed during repair: {}",
            index.name
        );
    }
    transaction
        .pragma_update(None, "schema_version", next_schema_version)
        .context("increment SQLite schema version after repair")?;
    transaction
        .commit()
        .context("commit malformed-index repair")?;

    connection
        .pragma_update(None, "writable_schema", false)
        .context("disable targeted sqlite_schema repair")?;
    connection
        .set_db_config(DbConfig::SQLITE_DBCONFIG_WRITABLE_SCHEMA, false)
        .context("disable malformed-schema inspection")?;

    let integrity = connection
        .pragma_query_value(None, "quick_check", |row| row.get::<_, String>(0))
        .context("validate repaired SQLite database")?;
    ensure!(
        integrity == "ok",
        "SQLite quick_check failed after schema repair: {integrity}"
    );
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .context("checkpoint repaired SQLite schema")?;

    Ok(SchemaRepairReport {
        removed_indexes: malformed_indexes
            .into_iter()
            .map(|index| index.name)
            .collect(),
    })
}

fn malformed_table_names(connection: &Connection) -> anyhow::Result<Vec<String>> {
    let loaded_tables = {
        let mut statement = connection
            .prepare("PRAGMA table_list")
            .context("prepare loaded-table scan")?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .context("scan loaded SQLite tables")?;
        rows.collect::<Result<Vec<_>, _>>()
            .context("decode loaded SQLite tables")?
            .into_iter()
            .filter(|(schema, _)| schema.eq_ignore_ascii_case("main"))
            .map(|(_, name)| name.to_ascii_lowercase())
            .collect::<HashSet<_>>()
    };

    let mut statement = connection
        .prepare(
            "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql IS NOT NULL ORDER BY rowid",
        )
        .context("prepare persisted-table scan")?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .context("scan persisted SQLite tables")?;
    let persisted_tables = rows
        .collect::<Result<Vec<_>, _>>()
        .context("decode persisted SQLite tables")?;

    Ok(persisted_tables
        .into_iter()
        .filter(|table| !loaded_tables.contains(&table.to_ascii_lowercase()))
        .collect())
}

fn malformed_explicit_indexes(connection: &Connection) -> anyhow::Result<Vec<MalformedIndex>> {
    let mut statement = connection
        .prepare(
            "SELECT schema.rowid, schema.name \
             FROM sqlite_schema AS schema \
             WHERE schema.type = 'index' \
               AND schema.sql IS NOT NULL \
               AND NOT EXISTS ( \
                 SELECT 1 \
                 FROM pragma_index_list(schema.tbl_name) AS loaded \
                 WHERE loaded.name = schema.name COLLATE NOCASE \
               ) \
             ORDER BY schema.rowid",
        )
        .context("prepare malformed-index scan")?;
    let rows = statement
        .query_map([], |row| {
            Ok(MalformedIndex {
                row_id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .context("scan malformed SQLite indexes")?;

    rows.collect::<Result<Vec<_>, _>>()
        .context("decode malformed SQLite indexes")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{Stmt, TransactionState};
    use crate::state::DbsState;
    use tempfile::tempdir;
    use uuid::Uuid;

    fn enable_schema_writes(connection: &Connection) {
        connection
            .set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, false)
            .expect("disable defensive mode");
        connection
            .set_db_config(DbConfig::SQLITE_DBCONFIG_WRITABLE_SCHEMA, true)
            .expect("enable writable-schema config");
        connection
            .pragma_update(None, "writable_schema", true)
            .expect("enable writable_schema pragma");
    }

    #[test]
    fn leaves_valid_explicit_indexes_untouched() {
        let directory = tempdir().expect("create temporary directory");
        let database_path = directory.path().join("valid-index.db");
        let connection = Connection::open(&database_path).expect("open SQLite database");
        connection
            .execute_batch(
                "CREATE TABLE entries (id TEXT PRIMARY KEY, lookup_value TEXT);\
                 CREATE INDEX ArbitraryMixedCaseIndex ON entries(lookup_value);",
            )
            .expect("create valid schema");
        drop(connection);

        let report = repair_malformed_indexes(&database_path).expect("inspect valid schema");
        assert!(report.removed_indexes.is_empty());

        let connection = Connection::open(&database_path).expect("reopen SQLite database");
        let count = connection
            .query_row(
                "SELECT count(*) FROM sqlite_schema WHERE name = 'ArbitraryMixedCaseIndex'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count valid index");
        assert_eq!(count, 1);
    }

    #[test]
    fn refuses_to_guess_at_malformed_table_or_column_definitions() {
        let directory = tempdir().expect("create temporary directory");
        let database_path = directory.path().join("malformed-table.db");
        let connection = Connection::open(&database_path).expect("open SQLite database");
        connection
            .execute("CREATE TABLE broken (id TEXT)", [])
            .expect("create initial table");
        enable_schema_writes(&connection);
        connection
            .execute(
                "UPDATE sqlite_schema SET sql = 'CREATE TABLE broken (' WHERE type = 'table' AND name = 'broken'",
                [],
            )
            .expect("corrupt table definition");
        let schema_version = connection
            .pragma_query_value(None, "schema_version", |row| row.get::<_, i64>(0))
            .expect("read schema version");
        connection
            .pragma_update(None, "schema_version", schema_version + 1)
            .expect("increment schema version");
        drop(connection);

        let error = repair_malformed_indexes(&database_path)
            .expect_err("malformed table must require manual repair");
        assert!(
            error
                .to_string()
                .contains("malformed SQLite table definitions require manual repair: broken")
        );
    }

    #[tokio::test]
    async fn repairs_arbitrary_mixed_case_index_left_by_turso_migration() {
        let directory = tempdir().expect("create temporary directory");
        let database_path = directory.path().join("main-main.db");
        let sqlite = Connection::open(&database_path).expect("open imported SQLite database");
        sqlite
            .execute_batch(
                "CREATE TABLE entries (\
                    id TEXT PRIMARY KEY,\
                    legacy_lookup_value TEXT,\
                    replacement_value TEXT\
                 );\
                 CREATE INDEX CustomerLookupMixedCase \
                 ON entries(legacy_lookup_value, id);\
                 INSERT INTO entries VALUES ('entry-1', 'legacy', 'replacement');",
            )
            .expect("create imported schema");
        drop(sqlite);

        // Turso lowercases names returned from PRAGMA index_list. Dropping that
        // lowercase form removes a mixed-case SQLite-imported index only from
        // Turso's in-memory schema, allowing the referenced column to be
        // removed while the persisted index row remains.
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();
        state
            .open_conn("main-main", &connection_id)
            .await
            .expect("open imported database");
        state
            .exec_stmts(
                "main-main",
                &connection_id,
                TransactionState::Autocommit,
                [
                    "BEGIN TRANSACTION",
                    "DROP INDEX IF EXISTS customerlookupmixedcase",
                    "ALTER TABLE entries DROP COLUMN legacy_lookup_value",
                    "CREATE INDEX ReplacementLookup ON entries(replacement_value, id)",
                    "COMMIT",
                ]
                .into_iter()
                .map(|sql| Stmt {
                    sql: sql.to_owned(),
                    args: Vec::new(),
                })
                .collect(),
            )
            .await
            .expect("run Turso schema migration");
        drop(state);

        let open_error = match turso::Builder::new_local(&database_path.to_string_lossy())
            .build()
            .await
        {
            Ok(_) => panic!("malformed index should make Turso schema parsing fail"),
            Err(error) => error,
        };
        assert!(
            open_error
                .to_string()
                .contains("invalid expression in CREATE INDEX")
        );

        let repaired_state = DbsState::new(directory.path().into());
        let repaired_connection_id = Uuid::new_v4();
        repaired_state
            .open_conn("main-main", &repaired_connection_id)
            .await
            .expect("repair and open database with tursod");
        let output = repaired_state
            .exec_stmts(
                "main-main",
                &repaired_connection_id,
                TransactionState::Autocommit,
                vec![Stmt {
                    sql: "SELECT count(*) FROM entries".to_owned(),
                    args: Vec::new(),
                }],
            )
            .await
            .expect("query repaired database");
        assert_eq!(output.results[0].rows.len(), 1);
        drop(repaired_state);

        let sqlite = Connection::open(&database_path).expect("open repaired SQLite database");
        let integrity = sqlite
            .pragma_query_value(None, "integrity_check", |row| row.get::<_, String>(0))
            .expect("check repaired SQLite database");
        assert_eq!(integrity, "ok");
        let remaining_indexes = sqlite
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' ORDER BY name")
            .expect("prepare index scan")
            .query_map([], |row| row.get::<_, String>(0))
            .expect("scan repaired indexes")
            .collect::<Result<Vec<_>, _>>()
            .expect("decode repaired indexes");
        assert!(
            remaining_indexes
                .iter()
                .any(|name| name.eq_ignore_ascii_case("ReplacementLookup"))
        );
        assert!(
            !remaining_indexes
                .iter()
                .any(|name| name.eq_ignore_ascii_case("CustomerLookupMixedCase"))
        );
    }
}
