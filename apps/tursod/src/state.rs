use crate::dto::{Column, Res, Stmt, Value};
use crate::{TursodError, TursodResult};
use std::collections::hash_map::Entry as HashMapEntry;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex, OnceCell, RwLock};
use turso::core::alloc::Vec;
use turso::{Connection, Database, Value as TValue};
use uuid::Uuid;

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

struct OpenedDatabase {
    database: Database,
    connections: RwLock<HashMap<Uuid, Arc<Mutex<Connection>>>>,
}

impl OpenedDatabase {
    pub fn new(database: Database) -> Self {
        OpenedDatabase {
            database,
            connections: RwLock::new(HashMap::new()),
        }
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

    pub(crate) async fn exec_stmts(
        &self,
        db_name: &str,
        conn_id: &Uuid,
        stmts: Vec<Stmt>,
    ) -> TursodResult<Vec<Res>> {
        let mut results: Vec<Res> = Vec::new();

        let conn = self.get_conn(db_name, conn_id).await?;
        let conn = conn.lock().await;

        for Stmt { sql, named_args } in stmts {
            let mut stmt = conn.prepare(sql.to_owned()).await.map_err(|source| {
                TursodError::PrepareFailed {
                    stmt: sql.to_owned(),
                    source,
                }
            })?;

            let cols = stmt
                .columns()
                .into_iter()
                .map(|column| Column {
                    name: column.name().to_owned(),
                    decl_type: column.decl_type().unwrap_or("").to_owned(),
                })
                .collect();

            let params = named_args
                .into_iter()
                .map(|arg| (arg.name, into_turso_value(arg.value)))
                .collect::<Vec<_>>();

            let mut query_rows =
                stmt.query(params)
                    .await
                    .map_err(|source| TursodError::QueryFailed {
                        stmt: sql.to_owned(),
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

    pub(crate) async fn get_conn(
        &self,
        db_name: &str,
        conn_id: &Uuid,
    ) -> TursodResult<Arc<Mutex<Connection>>> {
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

        let con = {
            let map = opened_db.connections.read().await;

            map.get(conn_id)
                .cloned()
                .ok_or(TursodError::ConnectionNotFound { conn_id: *conn_id })?
        };

        Ok(con)
    }

    pub(crate) async fn open_conn(
        &self,
        db_name: &str,
        conn_id: &Uuid,
    ) -> TursodResult<Arc<Mutex<Connection>>> {
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

        let conn = {
            let mut map = opened_db.connections.write().await;

            match map.entry(conn_id.to_owned()) {
                HashMapEntry::Occupied(entry) => Arc::clone(entry.get()),
                HashMapEntry::Vacant(entry) => {
                    let conn = Arc::new(Mutex::new(
                        opened_db
                            .database
                            .connect()
                            .map_err(TursodError::internal)?,
                    ));

                    Arc::clone(entry.insert(conn))
                }
            }
        };

        Ok(conn)
    }
}
