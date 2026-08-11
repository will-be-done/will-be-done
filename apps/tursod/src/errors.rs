use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum TursodError {
    #[error("invalid connection id `{connection_id}`")]
    InvalidConnectionId {
        connection_id: String,
        #[source]
        source: uuid::Error,
    },

    #[error("database `{db_name}` is not opened")]
    DatabaseNotOpened { db_name: String },

    #[error("prepare `{stmt}` failed due to `{source}`")]
    PrepareFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("query `{stmt}` failed due to `{source}`")]
    QueryFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("get value for `{stmt}` failed due to `{source}`")]
    QueryGetValueFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("row load for `{stmt}` failed due to `{source}`")]
    RowLoadFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("database `{db_name}` is not initialized")]
    DatabaseNotInitialized { db_name: String },

    #[error("connection `{conn_id}` not found")]
    ConnectionNotFound { conn_id: Uuid },

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl TursodError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidConnectionId { .. } => "INVALID_CONNECTION_ID",
            Self::DatabaseNotOpened { .. } => "DATABASE_NOT_OPENED",
            Self::PrepareFailed { .. } => "PREPARE_FAILED",
            Self::QueryFailed { .. } => "QUERY_FAILED",
            Self::QueryGetValueFailed { .. } => "QUERY_GET_VALUE_FAILED",
            Self::RowLoadFailed { .. } => "ROW_LOAD_FAILED",
            Self::DatabaseNotInitialized { .. } => "DATABASE_NOT_INITIALIZED",
            Self::ConnectionNotFound { .. } => "CONNECTION_NOT_FOUND",
            Self::Internal(_) => "INTERNAL_SERVER_ERROR",
        }
    }

    pub(crate) fn internal(error: impl Into<anyhow::Error>) -> Self {
        Self::Internal(error.into())
    }
}

pub type TursodResult<T> = Result<T, TursodError>;
