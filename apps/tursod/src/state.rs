use crate::dto::{Column, Res, Stmt, Value};
use crate::{TursodError, TursodResult};
use std::collections::hash_map::Entry as HashMapEntry;
use std::sync::Mutex;
use std::time::Duration;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex as TMutex, OnceCell, RwLock};
use tokio::time::Instant;
use turso::{Connection, Database, Value as TValue};
use uuid::Uuid;

const CONNECTION_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

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

    async fn open_conn(&self, conn_id: &Uuid) -> TursodResult<()> {
        let slot = {
            let mut map = self.connections.write().await;

            match map.entry(conn_id.to_owned()) {
                HashMapEntry::Occupied(entry) => Arc::clone(entry.get()),
                HashMapEntry::Vacant(entry) => Arc::clone(entry.insert(Arc::new(OnceCell::new()))),
            }
        };

        let connection = slot
            .get_or_try_init(|| async {
                let opened_conn = self.database.connect().map_err(TursodError::internal)?;

                for (name, value) in [
                    ("journal_mode", "mvcc"),
                    ("page_size", "4096"),
                    ("busy_timeout", "5000"),
                    ("synchronous", "FULL"),
                    ("cache_size", "0"),
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

        Ok(())
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

    async fn drop_stale_conns(&self) {
        let mut connections = self.connections.write().await;

        connections.retain(|_, slot| {
            // The map owns one Arc. Any additional owner is an open_conn call
            // that may still be initializing or waiting for this slot.
            if Arc::strong_count(slot) > 1 {
                return true;
            }

            slot.get().is_some_and(|connection| !connection.is_stale())
        });
    }
}

pub(crate) struct DbsState {
    opened_dbs: RwLock<HashMap<String, Arc<OnceCell<OpenedDatabase>>>>,
    base_path: PathBuf,
}

impl DbsState {
    pub(crate) fn new(base_path: PathBuf) -> Self {
        Self {
            opened_dbs: RwLock::new(HashMap::new()),
            base_path,
        }
    }

    pub(crate) async fn clean_conns(&self) {
        let db_slots = {
            let mut dbs = self.opened_dbs.write().await;

            // Keep empty slots while an open_conn call can still initialize them.
            dbs.retain(|_, slot| slot.get().is_some() || Arc::strong_count(slot) > 1);
            dbs.values().cloned().collect::<Vec<_>>()
        };

        for slot in db_slots {
            if let Some(db) = slot.get() {
                db.drop_stale_conns().await;
            }
        }
    }

    pub(crate) async fn exec_stmts(
        &self,
        db_name: &str,
        conn_id: &Uuid,
        stmts: Vec<Stmt>,
    ) -> TursodResult<Vec<Res>> {
        let mut results: Vec<Res> = Vec::new();

        let conn = self.get_conn(db_name, conn_id).await?;
        let conn = conn.lock().await;

        for Stmt { sql, args } in stmts {
            let mut stmt =
                conn.prepare(sql.clone())
                    .await
                    .map_err(|source| TursodError::PrepareFailed {
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

            let mut query_rows =
                stmt.query(params)
                    .await
                    .map_err(|source| TursodError::QueryFailed {
                        stmt: sql.clone(),
                        source,
                    })?;

            let mut rows = Vec::new();

            while let Some(row) =
                query_rows
                    .next()
                    .await
                    .map_err(|source| TursodError::RowLoadFailed {
                        stmt: sql.clone(),
                        source,
                    })?
            {
                let values = (0..row.column_count())
                    .map(|i| {
                        row.get_value(i).map(from_turso_value).map_err(|source| {
                            TursodError::QueryGetValueFailed {
                                stmt: sql.clone(),
                                source,
                            }
                        })
                    })
                    .collect::<TursodResult<Vec<_>>>()?;

                rows.push(values);
            }

            results.push(Res {
                cols,
                rows,

                affected_row_count: stmt.n_change(),
            });
        }

        Ok(results)
    }

    async fn get_conn(&self, db_name: &str, conn_id: &Uuid) -> TursodResult<ConnectionLease> {
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

    pub(crate) async fn open_conn(&self, db_name: &str, conn_id: &Uuid) -> TursodResult<()> {
        let cell = {
            let mut map = self.opened_dbs.write().await;
            Arc::clone(
                map.entry(db_name.to_owned())
                    .or_insert_with(|| Arc::new(OnceCell::new())),
            )
        };

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

        opened_db.open_conn(conn_id).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use tempfile::TempDir;
    use tokio::{task::JoinSet, time::advance};

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
}
