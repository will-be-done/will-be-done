use crate::dto::{Column, Res, Stmt, Value};
use crate::{TursodError, TursodResult};
use sha2::{Digest, Sha256};
use std::collections::hash_map::Entry as HashMapEntry;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex as TMutex, OnceCell, RwLock};
use tokio::time::Instant;
use tracing::Instrument;
use turso::{Connection, Database, Value as TValue};
use uuid::Uuid;

const CONNECTION_IDLE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_DATABASE_NAME_LEN: usize = 128;
const SLOW_QUERY_THRESHOLD: Duration = Duration::from_millis(500);

#[derive(Debug, Default)]
struct StatementTimings {
    prepare_us: u64,
    execute_us: u64,
    row_load_us: u64,
    value_decode_us: u64,
}

#[derive(Clone, Copy)]
struct PressureSnapshot {
    active_batches: usize,
    waiting_queries: usize,
    executing_queries: usize,
}

struct StatementObservation {
    timings: StatementTimings,
    duration_us: u64,
    duration_ms: u64,
    slow_query: bool,
    autocommit_before: Option<bool>,
    autocommit_after: Option<bool>,
    transaction_opened: bool,
    transaction_finished: bool,
}

struct RollbackStatus {
    outcome: &'static str,
    duration_us: u64,
    error: Option<String>,
}

impl RollbackStatus {
    fn not_needed() -> Self {
        Self {
            outcome: "not_needed",
            duration_us: 0,
            error: None,
        }
    }
}

macro_rules! log_query_completed {
    ($level:expr, $observation:expr, $result:expr, $pressure:expr) => {{
        let observation = $observation;
        let result = $result;
        let pressure = $pressure;
        tracing::event!(
            target: "tursod::sql",
            $level,
            outcome = "success",
            duration_us = observation.duration_us,
            duration_ms = observation.duration_ms,
            prepare_us = observation.timings.prepare_us,
            execute_us = observation.timings.execute_us,
            row_load_us = observation.timings.row_load_us,
            value_decode_us = observation.timings.value_decode_us,
            row_count = result.rows.len(),
            column_count = result.cols.len(),
            affected_row_count = result.affected_row_count,
            slow_query = observation.slow_query,
            slow_query_threshold_ms = SLOW_QUERY_THRESHOLD.as_millis() as u64,
            transaction_opened = observation.transaction_opened,
            transaction_finished = observation.transaction_finished,
            autocommit_before = ?observation.autocommit_before,
            autocommit_after = ?observation.autocommit_after,
            active_batches = pressure.active_batches,
            executing_queries = pressure.executing_queries,
            waiting_queries = pressure.waiting_queries,
            "query completed"
        );
    }};
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct OpenConnectionStats {
    pub(crate) database_reused: bool,
    pub(crate) connection_reused: bool,
    pub(crate) database_open_ms: u64,
    pub(crate) connection_open_ms: u64,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct TelemetrySnapshot {
    pub(crate) database_slots: usize,
    pub(crate) initialized_databases: usize,
    pub(crate) connection_slots: usize,
    pub(crate) initialized_connections: usize,
    pub(crate) active_batches: usize,
    pub(crate) waiting_queries: usize,
    pub(crate) executing_queries: usize,
    pub(crate) database_files: usize,
    pub(crate) database_bytes: u64,
    pub(crate) wal_bytes: u64,
    pub(crate) filesystem_available_bytes: u64,
}

struct ActivityGuard<'a>(&'a AtomicUsize);

impl<'a> ActivityGuard<'a> {
    fn enter(counter: &'a AtomicUsize) -> Self {
        counter.fetch_add(1, Ordering::Relaxed);
        Self(counter)
    }
}

impl Drop for ActivityGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

struct QueryTerminalGuard {
    started_at: Instant,
    completed: bool,
}

impl QueryTerminalGuard {
    fn new(started_at: Instant) -> Self {
        Self {
            started_at,
            completed: false,
        }
    }

    fn complete(&mut self) {
        self.completed = true;
    }
}

impl Drop for QueryTerminalGuard {
    fn drop(&mut self) {
        if !self.completed {
            tracing::warn!(
                target: "tursod::sql",
                outcome = "cancelled",
                error_stage = "cancelled",
                duration_us = elapsed_us(self.started_at),
                duration_ms = elapsed_ms(self.started_at),
                "query cancelled"
            );
        }
    }
}

fn elapsed_ms(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis() as u64
}

fn elapsed_us(started_at: Instant) -> u64 {
    started_at.elapsed().as_micros() as u64
}

fn query_operation(sql: &str) -> &'static str {
    match sql.split_ascii_whitespace().next().unwrap_or("") {
        word if word.eq_ignore_ascii_case("SELECT") => "SELECT",
        word if word.eq_ignore_ascii_case("INSERT") => "INSERT",
        word if word.eq_ignore_ascii_case("UPDATE") => "UPDATE",
        word if word.eq_ignore_ascii_case("DELETE") => "DELETE",
        word if word.eq_ignore_ascii_case("CREATE") => "CREATE",
        word if word.eq_ignore_ascii_case("ALTER") => "ALTER",
        word if word.eq_ignore_ascii_case("DROP") => "DROP",
        word if word.eq_ignore_ascii_case("PRAGMA") => "PRAGMA",
        word if word.eq_ignore_ascii_case("BEGIN") => "BEGIN",
        word if word.eq_ignore_ascii_case("COMMIT") => "COMMIT",
        word if word.eq_ignore_ascii_case("ROLLBACK") => "ROLLBACK",
        _ => "OTHER",
    }
}

fn query_fingerprint(sql: &str) -> String {
    format!("{:x}", Sha256::digest(sql.as_bytes()))
}

impl StatementObservation {
    fn new(
        started_at: Instant,
        timings: StatementTimings,
        autocommit_before: Option<bool>,
        autocommit_after: Option<bool>,
    ) -> Self {
        Self {
            timings,
            duration_us: elapsed_us(started_at),
            duration_ms: elapsed_ms(started_at),
            slow_query: started_at.elapsed() >= SLOW_QUERY_THRESHOLD,
            autocommit_before,
            autocommit_after,
            transaction_opened: autocommit_before == Some(true) && autocommit_after == Some(false),
            transaction_finished: autocommit_before == Some(false)
                && autocommit_after == Some(true),
        }
    }

    fn log_success(&self, result: &Res, pressure: PressureSnapshot) {
        if self.slow_query {
            log_query_completed!(tracing::Level::WARN, self, result, pressure);
        } else {
            log_query_completed!(tracing::Level::INFO, self, result, pressure);
        }
    }

    fn log_failure(
        &self,
        error: &TursodError,
        rollback: &RollbackStatus,
        pressure: PressureSnapshot,
    ) {
        tracing::error!(
            target: "tursod::sql",
            outcome = "error",
            error_code = error.code(),
            error_stage = error.stage(),
            error = ?error,
            duration_us = self.duration_us,
            duration_ms = self.duration_ms,
            prepare_us = self.timings.prepare_us,
            execute_us = self.timings.execute_us,
            row_load_us = self.timings.row_load_us,
            value_decode_us = self.timings.value_decode_us,
            slow_query = self.slow_query,
            slow_query_threshold_ms = SLOW_QUERY_THRESHOLD.as_millis() as u64,
            transaction_opened = self.transaction_opened,
            transaction_finished = self.transaction_finished,
            rollback_outcome = rollback.outcome,
            rollback_duration_us = rollback.duration_us,
            rollback_error = rollback.error.as_deref().unwrap_or(""),
            autocommit_before = ?self.autocommit_before,
            autocommit_after = ?self.autocommit_after,
            active_batches = pressure.active_batches,
            executing_queries = pressure.executing_queries,
            waiting_queries = pressure.waiting_queries,
            "query failed"
        );
    }
}

fn validate_db_name(db_name: &str) -> TursodResult<()> {
    if db_name.is_empty()
        || db_name.len() > MAX_DATABASE_NAME_LEN
        || !db_name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(TursodError::BadRequest);
    }

    Ok(())
}

fn into_turso_value(value: Value) -> TValue {
    match value {
        Value::Null => TValue::Null,
        Value::Integer(value) => TValue::Integer(value),
        Value::Real(value) => TValue::Real(value),
        Value::Text(value) => TValue::Text(value),
        Value::Blob(value) => TValue::Blob(value),
    }
}

fn from_turso_value(value: TValue) -> Value {
    match value {
        TValue::Null => Value::Null,
        TValue::Integer(value) => Value::Integer(value),
        TValue::Real(value) => Value::Real(value),
        TValue::Text(value) => Value::Text(value),
        TValue::Blob(value) => Value::Blob(value),
    }
}

struct ConnectionUsage {
    active_users: usize,
    last_used_at: Instant,
}

struct OpenedConnection {
    usage: Mutex<ConnectionUsage>,
    connection: TMutex<Connection>,
}

struct ConnectionLease {
    connection: Arc<OpenedConnection>,
}

impl ConnectionLease {
    async fn lock(&self) -> tokio::sync::MutexGuard<'_, Connection> {
        self.connection.connection.lock().await
    }
}

impl Drop for ConnectionLease {
    fn drop(&mut self) {
        let mut usage = self
            .connection
            .usage
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        debug_assert!(usage.active_users > 0);
        usage.active_users -= 1;

        if usage.active_users == 0 {
            usage.last_used_at = Instant::now();
        }
    }
}

impl OpenedConnection {
    fn new(connection: Connection) -> Self {
        Self {
            usage: Mutex::new(ConnectionUsage {
                active_users: 0,
                last_used_at: Instant::now(),
            }),
            connection: TMutex::new(connection),
        }
    }

    fn acquire(self: &Arc<Self>) -> ConnectionLease {
        {
            let mut usage = self
                .usage
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());

            usage.active_users += 1;
        }

        ConnectionLease {
            connection: Arc::clone(self),
        }
    }

    fn is_stale(&self) -> bool {
        let usage = self.usage.lock().unwrap_or_else(|p| p.into_inner());

        usage.active_users == 0 && usage.last_used_at.elapsed() >= CONNECTION_IDLE_TIMEOUT
    }

    fn touch(&self) {
        let mut usage = self.usage.lock().unwrap_or_else(|p| p.into_inner());
        usage.last_used_at = Instant::now();
    }
}

type SharedConnection = Arc<OpenedConnection>;
type ConnectionSlot = Arc<OnceCell<SharedConnection>>;

struct OpenedDatabase {
    database: Database,
    connections: RwLock<HashMap<Uuid, ConnectionSlot>>,
}

impl OpenedDatabase {
    fn new(database: Database) -> Self {
        Self {
            database,
            connections: RwLock::new(HashMap::new()),
        }
    }

    async fn open_conn(&self, conn_id: &Uuid) -> TursodResult<(bool, u64)> {
        let started_at = Instant::now();
        let slot = if let Some(slot) = self.connections.read().await.get(conn_id).cloned() {
            slot
        } else {
            let mut map = self.connections.write().await;
            match map.entry(*conn_id) {
                HashMapEntry::Occupied(entry) => Arc::clone(entry.get()),
                HashMapEntry::Vacant(entry) => Arc::clone(entry.insert(Arc::new(OnceCell::new()))),
            }
        };
        let connection_reused = slot.get().is_some();

        let connection = slot
            .get_or_try_init(|| async {
                let opened_conn = self.database.connect().map_err(TursodError::internal)?;

                for (name, value) in [
                    ("journal_mode", "mvcc"),
                    ("page_size", "4096"),
                    ("busy_timeout", "5000"),
                    ("synchronous", "FULL"),
                    // Bound each connection's cache to 100 4 KiB pages (~400 KiB).
                    ("cache_size", "100"),
                    ("foreign_keys", "ON"),
                ] {
                    opened_conn
                        .pragma_update(name, value)
                        .await
                        .map_err(TursodError::internal)?;
                }

                Ok::<_, TursodError>(Arc::new(OpenedConnection::new(opened_conn)))
            })
            .await?;

        connection.touch();

        Ok((connection_reused, elapsed_ms(started_at)))
    }

    async fn get_conn(&self, conn_id: &Uuid) -> TursodResult<ConnectionLease> {
        let map = self.connections.read().await;

        let conn = map
            .get(conn_id)
            .ok_or(TursodError::ConnectionNotFound { conn_id: *conn_id })?
            .get()
            .ok_or(TursodError::ConnectionNotFound { conn_id: *conn_id })?;

        Ok(conn.acquire())
    }

    async fn drop_stale_conns(&self) -> usize {
        let mut connections = self.connections.write().await;
        let previous_len = connections.len();

        connections.retain(|_, slot| {
            // The map owns one Arc. Any additional owner is an open_conn call
            // that may still be initializing or waiting for this slot.
            if Arc::strong_count(slot) > 1 {
                return true;
            }

            slot.get().is_some_and(|connection| !connection.is_stale())
        });

        previous_len - connections.len()
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct CleanupStats {
    pub(crate) database_slots: usize,
    pub(crate) connections: usize,
}

pub(crate) struct DbsState {
    opened_dbs: RwLock<HashMap<String, Arc<OnceCell<OpenedDatabase>>>>,
    base_path: PathBuf,
    active_batches: AtomicUsize,
    waiting_queries: AtomicUsize,
    executing_queries: AtomicUsize,
}

impl DbsState {
    pub(crate) fn new(base_path: PathBuf) -> Self {
        Self {
            opened_dbs: RwLock::new(HashMap::new()),
            base_path,
            active_batches: AtomicUsize::new(0),
            waiting_queries: AtomicUsize::new(0),
            executing_queries: AtomicUsize::new(0),
        }
    }

    pub(crate) async fn clean_conns(&self) -> CleanupStats {
        let (database_slots, db_slots) = {
            let mut dbs = self.opened_dbs.write().await;
            let previous_len = dbs.len();

            // Keep empty slots while an open_conn call can still initialize them.
            dbs.retain(|_, slot| slot.get().is_some() || Arc::strong_count(slot) > 1);
            (
                previous_len - dbs.len(),
                dbs.values().cloned().collect::<Vec<_>>(),
            )
        };

        let mut connections = 0;
        for slot in db_slots {
            if let Some(db) = slot.get() {
                connections += db.drop_stale_conns().await;
            }
        }

        CleanupStats {
            database_slots,
            connections,
        }
    }

    pub(crate) async fn telemetry_snapshot(&self) -> TursodResult<TelemetrySnapshot> {
        let db_slots = self
            .opened_dbs
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let database_slots = db_slots.len();
        let initialized_databases = db_slots.iter().filter(|slot| slot.get().is_some()).count();
        let mut connection_slots = 0;
        let mut initialized_connections = 0;

        for slot in db_slots {
            if let Some(database) = slot.get() {
                let connections = database.connections.read().await;
                connection_slots += connections.len();
                initialized_connections += connections
                    .values()
                    .filter(|connection| connection.get().is_some())
                    .count();
            }
        }

        let base_path = self.base_path.clone();
        let storage = tokio::task::spawn_blocking(move || {
            let mut database_files = 0;
            let mut database_bytes = 0;
            let mut wal_bytes = 0;

            for entry in std::fs::read_dir(&base_path)? {
                let entry = entry?;
                let metadata = entry.metadata()?;
                if !metadata.is_file() {
                    continue;
                }

                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".db-wal") || name.ends_with(".wal") {
                    wal_bytes += metadata.len();
                } else if name.ends_with(".db") {
                    database_files += 1;
                    database_bytes += metadata.len();
                }
            }

            Ok::<_, std::io::Error>((
                database_files,
                database_bytes,
                wal_bytes,
                fs4::available_space(&base_path)?,
            ))
        })
        .await
        .map_err(TursodError::internal)?
        .map_err(TursodError::internal)?;

        Ok(TelemetrySnapshot {
            database_slots,
            initialized_databases,
            connection_slots,
            initialized_connections,
            active_batches: self.active_batches.load(Ordering::Relaxed),
            waiting_queries: self.waiting_queries.load(Ordering::Relaxed),
            executing_queries: self.executing_queries.load(Ordering::Relaxed),
            database_files: storage.0,
            database_bytes: storage.1,
            wal_bytes: storage.2,
            filesystem_available_bytes: storage.3,
        })
    }

    pub(crate) async fn exec_stmts(
        &self,
        db_name: &str,
        conn_id: &Uuid,
        stmts: Vec<Stmt>,
    ) -> TursodResult<Vec<Res>> {
        let batch_started_at = Instant::now();
        let _active_batch = ActivityGuard::enter(&self.active_batches);
        let conn = self.get_conn(db_name, conn_id).await?;
        let connection_wait_started_at = Instant::now();
        let waiting_query = ActivityGuard::enter(&self.waiting_queries);
        let conn = conn.lock().await;
        let connection_wait_ms = elapsed_ms(connection_wait_started_at);
        drop(waiting_query);

        let statement_count = stmts.len();
        let mut results = Vec::with_capacity(statement_count);

        for (statement_index, stmt) in stmts.into_iter().enumerate() {
            match self.exec_logged_stmt(&conn, statement_index, stmt).await {
                Ok(result) => results.push(result),
                Err(error) => {
                    self.log_batch_failure(
                        batch_started_at,
                        statement_count,
                        results.len(),
                        statement_index,
                        connection_wait_ms,
                        &error,
                    );
                    return Err(error);
                }
            }
        }

        self.log_batch_success(
            batch_started_at,
            statement_count,
            results.len(),
            connection_wait_ms,
            conn.is_autocommit().ok(),
        );
        Ok(results)
    }

    async fn exec_logged_stmt(
        &self,
        conn: &Connection,
        statement_index: usize,
        stmt: Stmt,
    ) -> TursodResult<Res> {
        let query_span = tracing::info_span!(
            target: "tursod::sql",
            "sql_statement",
            statement_index,
            sql = stmt.sql.as_str(),
            operation = query_operation(&stmt.sql),
            query_fingerprint = query_fingerprint(&stmt.sql),
            parameter_count = stmt.args.len(),
        );

        async {
            let started_at = Instant::now();
            let _executing_query = ActivityGuard::enter(&self.executing_queries);
            let mut terminal_log = QueryTerminalGuard::new(started_at);
            let autocommit_before = conn.is_autocommit().ok();
            let mut timings = StatementTimings::default();
            let result = Self::exec_stmt(conn, stmt, &mut timings).await;
            let autocommit_after = conn.is_autocommit().ok();
            let mut observation =
                StatementObservation::new(started_at, timings, autocommit_before, autocommit_after);

            match &result {
                Ok(response) => observation.log_success(response, self.pressure_snapshot()),
                Err(error) => {
                    let rollback = Self::rollback_after_error(conn, autocommit_after).await;
                    observation.autocommit_after = conn.is_autocommit().ok();
                    observation.transaction_finished = autocommit_after == Some(false)
                        && observation.autocommit_after == Some(true);
                    observation.log_failure(error, &rollback, self.pressure_snapshot());
                }
            }

            terminal_log.complete();
            result
        }
        .instrument(query_span)
        .await
    }

    async fn rollback_after_error(
        conn: &Connection,
        autocommit_after: Option<bool>,
    ) -> RollbackStatus {
        match autocommit_after {
            Some(false) => {
                let started_at = Instant::now();
                match conn.execute("ROLLBACK", ()).await {
                    Ok(_) => RollbackStatus {
                        outcome: "succeeded",
                        duration_us: elapsed_us(started_at),
                        error: None,
                    },
                    Err(error) => RollbackStatus {
                        outcome: "failed",
                        duration_us: elapsed_us(started_at),
                        error: Some(error.to_string()),
                    },
                }
            }
            Some(true) => RollbackStatus::not_needed(),
            None => RollbackStatus {
                outcome: "state_unknown",
                duration_us: 0,
                error: None,
            },
        }
    }

    fn pressure_snapshot(&self) -> PressureSnapshot {
        PressureSnapshot {
            active_batches: self.active_batches.load(Ordering::Relaxed),
            waiting_queries: self.waiting_queries.load(Ordering::Relaxed),
            executing_queries: self.executing_queries.load(Ordering::Relaxed),
        }
    }

    fn log_batch_success(
        &self,
        started_at: Instant,
        statement_count: usize,
        completed_statement_count: usize,
        connection_wait_ms: u64,
        autocommit_after: Option<bool>,
    ) {
        let pressure = self.pressure_snapshot();
        tracing::info!(
            outcome = "success",
            statement_count,
            completed_statement_count,
            connection_wait_ms,
            batch_duration_ms = elapsed_ms(started_at),
            autocommit_after = ?autocommit_after,
            active_batches = pressure.active_batches,
            executing_queries = pressure.executing_queries,
            waiting_queries = pressure.waiting_queries,
            "statement batch completed"
        );
    }

    fn log_batch_failure(
        &self,
        started_at: Instant,
        statement_count: usize,
        completed_statement_count: usize,
        failing_statement_index: usize,
        connection_wait_ms: u64,
        error: &TursodError,
    ) {
        let pressure = self.pressure_snapshot();
        tracing::error!(
            outcome = "error",
            statement_count,
            completed_statement_count,
            failing_statement_index,
            connection_wait_ms,
            batch_duration_ms = elapsed_ms(started_at),
            error_code = error.code(),
            error_stage = error.stage(),
            active_batches = pressure.active_batches,
            executing_queries = pressure.executing_queries,
            waiting_queries = pressure.waiting_queries,
            "statement batch failed"
        );
    }

    async fn exec_stmt(
        conn: &Connection,
        stmt: Stmt,
        timings: &mut StatementTimings,
    ) -> TursodResult<Res> {
        let Stmt { sql, args } = stmt;
        let prepare_started_at = Instant::now();
        let prepared = conn.prepare(sql.clone()).await;
        timings.prepare_us = elapsed_us(prepare_started_at);
        let mut stmt = prepared.map_err(|source| TursodError::PrepareFailed {
            stmt: sql.clone(),
            source,
        })?;

        let cols = stmt
            .columns()
            .into_iter()
            .map(|column| Column {
                name: column.name().to_owned(),
                decl_type: column.decl_type().unwrap_or("").to_owned(),
            })
            .collect();

        let params = args.into_iter().map(into_turso_value).collect::<Vec<_>>();

        let execute_started_at = Instant::now();
        let query = stmt.query(params).await;
        timings.execute_us = elapsed_us(execute_started_at);
        let mut query_rows = query.map_err(|source| TursodError::QueryFailed {
            stmt: sql.clone(),
            source,
        })?;

        let mut rows = Vec::new();

        loop {
            let row_load_started_at = Instant::now();
            let row = query_rows.next().await;
            timings.row_load_us += elapsed_us(row_load_started_at);
            let Some(row) = row.map_err(|source| TursodError::RowLoadFailed {
                stmt: sql.clone(),
                source,
            })?
            else {
                break;
            };

            let value_decode_started_at = Instant::now();
            let values = (0..row.column_count())
                .map(|i| {
                    row.get_value(i).map(from_turso_value).map_err(|source| {
                        TursodError::QueryGetValueFailed {
                            stmt: sql.clone(),
                            source,
                        }
                    })
                })
                .collect::<TursodResult<Vec<_>>>();
            timings.value_decode_us += elapsed_us(value_decode_started_at);

            rows.push(values?);
        }

        Ok(Res {
            cols,
            rows,

            affected_row_count: stmt.n_change(),
        })
    }

    async fn get_conn(&self, db_name: &str, conn_id: &Uuid) -> TursodResult<ConnectionLease> {
        validate_db_name(db_name)?;

        let cell = {
            let map = self.opened_dbs.read().await;

            map.get(db_name)
                .cloned()
                .ok_or_else(|| TursodError::DatabaseNotOpened {
                    db_name: db_name.to_owned(),
                })?
        };

        let opened_db = cell
            .get()
            .ok_or_else(|| TursodError::DatabaseNotInitialized {
                db_name: db_name.to_owned(),
            })?;

        opened_db.get_conn(conn_id).await
    }

    pub(crate) async fn open_conn(
        &self,
        db_name: &str,
        conn_id: &Uuid,
    ) -> TursodResult<OpenConnectionStats> {
        validate_db_name(db_name)?;
        let database_open_started_at = Instant::now();

        let cell = if let Some(cell) = self.opened_dbs.read().await.get(db_name).cloned() {
            cell
        } else {
            let mut map = self.opened_dbs.write().await;
            Arc::clone(
                map.entry(db_name.to_owned())
                    .or_insert_with(|| Arc::new(OnceCell::new())),
            )
        };
        let database_reused = cell.get().is_some();

        let path = self
            .base_path
            .join(format!("{db_name}.db"))
            .to_string_lossy()
            .into_owned();

        let opened_db = cell
            .get_or_try_init(|| async {
                let db = turso::Builder::new_local(&path)
                    .build()
                    .await
                    .map_err(TursodError::internal)?;

                Ok::<OpenedDatabase, TursodError>(OpenedDatabase::new(db))
            })
            .await?;
        let database_open_ms = elapsed_ms(database_open_started_at);

        let (connection_reused, connection_open_ms) = opened_db.open_conn(conn_id).await?;

        Ok(OpenConnectionStats {
            database_reused,
            connection_reused,
            database_open_ms,
            connection_open_ms,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use serde_json::Value as JsonValue;
    use std::io::{self, Write};
    use tempfile::TempDir;
    use tokio::{task::JoinSet, time::advance};
    use tracing::instrument::WithSubscriber;

    #[derive(Clone, Default)]
    struct LogBuffer(Arc<Mutex<Vec<u8>>>);

    struct LogWriter(LogBuffer);

    impl Write for LogWriter {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            self.0.0.lock().unwrap().extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    async fn opened_database(directory: &TempDir, name: &str) -> OpenedDatabase {
        let path = directory.path().join(name);
        let path = path.to_string_lossy();
        let database = turso::Builder::new_local(&path)
            .build()
            .await
            .expect("open temporary database");

        OpenedDatabase::new(database)
    }

    fn statement(sql: &str) -> Stmt {
        Stmt {
            sql: sql.to_owned(),
            args: Vec::new(),
        }
    }

    #[test]
    fn classifies_and_fingerprints_queries_without_logging_parameters() {
        assert_eq!(query_operation("  select 1"), "SELECT");
        assert_eq!(query_operation("BEGIN TRANSACTION"), "BEGIN");
        assert_eq!(
            query_operation("WITH rows AS (SELECT 1) SELECT * FROM rows"),
            "OTHER"
        );
        assert_eq!(query_fingerprint("SELECT 1").len(), 64);
        assert_ne!(query_fingerprint("SELECT 1"), query_fingerprint("SELECT 2"));
    }

    #[tokio::test]
    async fn logs_each_statement_only_after_success_or_failure() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();
        let output = LogBuffer::default();
        let writer = output.clone();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(true)
            .with_writer(move || LogWriter(writer.clone()))
            .finish();

        async {
            state
                .open_conn("telemetry", &connection_id)
                .await
                .expect("open connection");
            state
                .exec_stmts(
                    "telemetry",
                    &connection_id,
                    vec![
                        statement("CREATE TABLE entries (id INTEGER)"),
                        statement("SELECT * FROM missing_table"),
                    ],
                )
                .await
                .expect_err("second statement fails");
        }
        .with_subscriber(subscriber)
        .await;

        let bytes = output.0.lock().unwrap();
        let events = std::str::from_utf8(&bytes)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str::<JsonValue>(line).unwrap())
            .collect::<Vec<_>>();
        let query_events = events
            .iter()
            .filter(|event| event["target"] == "tursod::sql")
            .collect::<Vec<_>>();

        assert_eq!(
            query_events
                .iter()
                .filter(|event| event["message"] == "query started")
                .count(),
            0
        );
        assert_eq!(
            query_events
                .iter()
                .filter(|event| matches!(
                    event["message"].as_str(),
                    Some("query completed" | "query failed")
                ))
                .count(),
            2
        );
        assert_eq!(query_events[0]["outcome"], "success");
        assert_eq!(query_events[1]["outcome"], "error");
        assert_eq!(query_events[1]["error_stage"], "prepare");
        assert!(query_events[0].get("duration_us").is_some());
        assert!(query_events[0].get("duration_ms").is_some());
        assert!(query_events[0].get("prepare_us").is_some());
        assert_eq!(query_events[0]["spans"][0]["operation"], "CREATE");
        assert_eq!(query_events[1]["spans"][0]["operation"], "SELECT");
    }

    async fn contains_connection(database: &OpenedDatabase, connection_id: &Uuid) -> bool {
        database
            .connections
            .read()
            .await
            .contains_key(connection_id)
    }

    #[tokio::test]
    async fn connection_cleanup_removes_only_abandoned_empty_slots() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = opened_database(&directory, "empty-slots.db").await;
        let abandoned_id = Uuid::new_v4();
        let in_flight_id = Uuid::new_v4();
        let in_flight_slot = Arc::new(OnceCell::new());
        let in_flight_owner = Arc::clone(&in_flight_slot);

        {
            let mut connections = opened_database.connections.write().await;
            connections.insert(abandoned_id, Arc::new(OnceCell::new()));
            connections.insert(in_flight_id, in_flight_slot);
        }

        opened_database.drop_stale_conns().await;

        {
            let connections = opened_database.connections.read().await;
            assert!(!connections.contains_key(&abandoned_id));
            assert!(connections.contains_key(&in_flight_id));
        }

        drop(in_flight_owner);
        opened_database.drop_stale_conns().await;

        assert!(opened_database.connections.read().await.is_empty());
    }

    #[tokio::test]
    async fn database_cleanup_removes_only_abandoned_empty_slots() {
        let state = DbsState::new(PathBuf::new());
        let in_flight_slot = Arc::new(OnceCell::new());
        let in_flight_owner = Arc::clone(&in_flight_slot);

        {
            let mut databases = state.opened_dbs.write().await;
            databases.insert("abandoned".to_owned(), Arc::new(OnceCell::new()));
            databases.insert("in-flight".to_owned(), in_flight_slot);
        }

        state.clean_conns().await;

        {
            let databases = state.opened_dbs.read().await;
            assert!(!databases.contains_key("abandoned"));
            assert!(databases.contains_key("in-flight"));
        }

        drop(in_flight_owner);
        state.clean_conns().await;

        assert!(state.opened_dbs.read().await.is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn idle_connection_is_evicted_at_timeout() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = opened_database(&directory, "idle.db").await;
        let connection_id = Uuid::new_v4();

        opened_database
            .open_conn(&connection_id)
            .await
            .expect("open connection");

        advance(CONNECTION_IDLE_TIMEOUT).await;
        opened_database.drop_stale_conns().await;

        assert!(!contains_connection(&opened_database, &connection_id).await);
        assert!(matches!(
            opened_database.get_conn(&connection_id).await,
            Err(TursodError::ConnectionNotFound { conn_id }) if conn_id == connection_id
        ));
    }

    #[tokio::test(start_paused = true)]
    async fn active_connection_is_retained_until_last_lease_expires() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = opened_database(&directory, "active.db").await;
        let connection_id = Uuid::new_v4();

        opened_database
            .open_conn(&connection_id)
            .await
            .expect("open connection");
        let first_lease = opened_database
            .get_conn(&connection_id)
            .await
            .expect("acquire first lease");
        let second_lease = opened_database
            .get_conn(&connection_id)
            .await
            .expect("acquire second lease");

        advance(CONNECTION_IDLE_TIMEOUT).await;
        drop(first_lease);
        opened_database.drop_stale_conns().await;
        assert!(contains_connection(&opened_database, &connection_id).await);

        advance(CONNECTION_IDLE_TIMEOUT).await;
        opened_database.drop_stale_conns().await;
        assert!(contains_connection(&opened_database, &connection_id).await);

        drop(second_lease);
        advance(CONNECTION_IDLE_TIMEOUT - Duration::from_millis(1)).await;
        opened_database.drop_stale_conns().await;
        assert!(contains_connection(&opened_database, &connection_id).await);

        advance(Duration::from_millis(1)).await;
        opened_database.drop_stale_conns().await;
        assert!(!contains_connection(&opened_database, &connection_id).await);
    }

    #[tokio::test(start_paused = true)]
    async fn opening_existing_connection_refreshes_idle_timeout() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = opened_database(&directory, "refresh.db").await;
        let connection_id = Uuid::new_v4();

        opened_database
            .open_conn(&connection_id)
            .await
            .expect("open connection");

        advance(CONNECTION_IDLE_TIMEOUT).await;
        opened_database
            .open_conn(&connection_id)
            .await
            .expect("reopen connection");

        advance(CONNECTION_IDLE_TIMEOUT - Duration::from_millis(1)).await;
        opened_database.drop_stale_conns().await;
        assert!(contains_connection(&opened_database, &connection_id).await);

        advance(Duration::from_millis(1)).await;
        opened_database.drop_stale_conns().await;
        assert!(!contains_connection(&opened_database, &connection_id).await);
    }

    #[tokio::test(start_paused = true)]
    async fn connection_idle_timeouts_are_tracked_independently() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = opened_database(&directory, "independent.db").await;
        let stale_id = Uuid::new_v4();
        let refreshed_id = Uuid::new_v4();

        opened_database
            .open_conn(&stale_id)
            .await
            .expect("open stale connection");
        opened_database
            .open_conn(&refreshed_id)
            .await
            .expect("open connection to refresh");

        advance(CONNECTION_IDLE_TIMEOUT / 2).await;
        opened_database
            .open_conn(&refreshed_id)
            .await
            .expect("refresh connection");
        advance(CONNECTION_IDLE_TIMEOUT / 2).await;
        opened_database.drop_stale_conns().await;

        assert!(!contains_connection(&opened_database, &stale_id).await);
        assert!(contains_connection(&opened_database, &refreshed_id).await);
    }

    #[tokio::test]
    async fn concurrent_opens_share_one_connection() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let opened_database = Arc::new(opened_database(&directory, "concurrent.db").await);
        let connection_id = Uuid::new_v4();
        let mut opens = JoinSet::new();

        for _ in 0..32 {
            let opened_database = Arc::clone(&opened_database);
            opens.spawn(async move {
                opened_database.open_conn(&connection_id).await?;
                let lease = opened_database.get_conn(&connection_id).await?;

                Ok::<_, TursodError>(Arc::clone(&lease.connection))
            });
        }

        let mut connections = Vec::new();
        while let Some(result) = opens.join_next().await {
            connections.push(result.expect("open task succeeds").expect("open succeeds"));
        }

        assert_eq!(opened_database.connections.read().await.len(), 1);
        let first = connections.first().expect("at least one connection");
        assert!(
            connections
                .iter()
                .all(|connection| Arc::ptr_eq(first, connection))
        );
    }

    #[tokio::test]
    async fn failed_database_initialization_is_cleaned_up_and_can_be_retried() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let base_path = directory.path().join("databases");
        std::fs::write(&base_path, "not a directory").expect("create blocking file");
        let state = DbsState::new(base_path.clone());
        let connection_id = Uuid::new_v4();

        state
            .open_conn("test", &connection_id)
            .await
            .expect_err("database path below a file must fail");

        {
            let databases = state.opened_dbs.read().await;
            let slot = databases.get("test").expect("failed slot is registered");
            assert!(slot.get().is_none());
        }

        state.clean_conns().await;
        assert!(state.opened_dbs.read().await.is_empty());

        std::fs::remove_file(&base_path).expect("remove blocking file");
        std::fs::create_dir(&base_path).expect("create database directory");
        state
            .open_conn("test", &connection_id)
            .await
            .expect("retry database initialization");

        assert!(state.get_conn("test", &connection_id).await.is_ok());
    }

    #[tokio::test(start_paused = true)]
    async fn data_persists_after_connection_eviction_and_reopen() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();

        state
            .open_conn("test", &connection_id)
            .await
            .expect("open connection");
        state
            .exec_stmts(
                "test",
                &connection_id,
                vec![
                    statement("CREATE TABLE messages (body TEXT NOT NULL)"),
                    Stmt {
                        sql: "INSERT INTO messages VALUES (?)".to_owned(),
                        args: vec![Value::Text("still here".to_owned())],
                    },
                ],
            )
            .await
            .expect("write data");

        advance(CONNECTION_IDLE_TIMEOUT).await;
        state.clean_conns().await;
        assert!(matches!(
            state.get_conn("test", &connection_id).await,
            Err(TursodError::ConnectionNotFound { conn_id }) if conn_id == connection_id
        ));

        state
            .open_conn("test", &connection_id)
            .await
            .expect("reopen evicted connection");
        let results = state
            .exec_stmts(
                "test",
                &connection_id,
                vec![statement("SELECT body FROM messages")],
            )
            .await
            .expect("read persisted data");

        assert_eq!(
            results[0].rows,
            vec![vec![Value::Text("still here".to_owned())]]
        );
    }

    #[tokio::test]
    async fn reports_affected_rows_for_each_statement() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();
        state
            .open_conn("test", &connection_id)
            .await
            .expect("open connection");

        let results = state
            .exec_stmts(
                "test",
                &connection_id,
                vec![
                    statement("CREATE TABLE affected_rows (value INTEGER)"),
                    statement("INSERT INTO affected_rows VALUES (1), (2)"),
                    statement("SELECT value FROM affected_rows ORDER BY value"),
                ],
            )
            .await
            .expect("execute statements");

        assert_eq!(results[1].affected_row_count, 2);
        assert_eq!(results[2].affected_row_count, 0);
    }

    #[tokio::test]
    async fn rolls_back_an_open_transaction_after_statement_failure() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();
        state
            .open_conn("test", &connection_id)
            .await
            .expect("open connection");
        state
            .exec_stmts(
                "test",
                &connection_id,
                vec![statement("CREATE TABLE rollback_test (value INTEGER)")],
            )
            .await
            .expect("create table");

        state
            .exec_stmts(
                "test",
                &connection_id,
                vec![
                    statement("BEGIN TRANSACTION"),
                    statement("INSERT INTO rollback_test VALUES (1)"),
                    statement("INSERT INTO missing_table VALUES (1)"),
                ],
            )
            .await
            .expect_err("failing statement must reject the batch");

        let results = state
            .exec_stmts(
                "test",
                &connection_id,
                vec![
                    statement("BEGIN TRANSACTION"),
                    statement("SELECT count(*) FROM rollback_test"),
                    statement("ROLLBACK"),
                ],
            )
            .await
            .expect("a later request can open a new transaction");

        assert_eq!(results[1].rows, vec![vec![Value::Integer(0)]]);
    }

    #[tokio::test]
    async fn rejects_invalid_database_names_before_path_construction() {
        let directory = tempfile::tempdir().expect("create temporary directory");
        let state = DbsState::new(directory.path().into());
        let connection_id = Uuid::new_v4();
        let too_long = "a".repeat(MAX_DATABASE_NAME_LEN + 1);

        for invalid_name in [
            "",
            "../escape",
            "nested/database",
            r"nested\database",
            ".",
            "non-ascii-é",
            &too_long,
        ] {
            assert!(matches!(
                state.open_conn(invalid_name, &connection_id).await,
                Err(TursodError::BadRequest)
            ));
            assert!(matches!(
                state.get_conn(invalid_name, &connection_id).await,
                Err(TursodError::BadRequest)
            ));
        }

        assert!(directory.path().read_dir().unwrap().next().is_none());
    }
}
