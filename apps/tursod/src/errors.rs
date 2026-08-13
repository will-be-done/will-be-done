use thiserror::Error;
use uuid::Uuid;

use crate::dto::TransactionState;

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

    #[error("statement preparation failed")]
    PrepareFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("statement query failed")]
    QueryFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("statement value extraction failed")]
    QueryGetValueFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("statement row loading failed")]
    RowLoadFailed {
        stmt: String,
        #[source]
        source: turso::Error,
    },

    #[error("database `{db_name}` is not initialized")]
    DatabaseNotInitialized { db_name: String },

    #[error("connection `{conn_id}` not found")]
    ConnectionNotFound { conn_id: Uuid },

    #[error("transaction state mismatch: expected {expected:?}, actual {actual:?}")]
    TransactionStateMismatch {
        expected: TransactionState,
        actual: TransactionState,
    },

    #[error("invalid database name")]
    BadRequest,

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
            Self::TransactionStateMismatch { .. } => "TRANSACTION_STATE_MISMATCH",
            Self::BadRequest => "BAD_REQUEST",
            Self::Internal(_) => "INTERNAL_SERVER_ERROR",
        }
    }

    pub(crate) fn internal(error: impl Into<anyhow::Error>) -> Self {
        Self::Internal(error.into())
    }

    pub(crate) const fn stage(&self) -> &'static str {
        match self {
            Self::InvalidConnectionId { .. } | Self::BadRequest => "validate",
            Self::DatabaseNotOpened { .. }
            | Self::DatabaseNotInitialized { .. }
            | Self::ConnectionNotFound { .. }
            | Self::TransactionStateMismatch { .. } => "connection",
            Self::PrepareFailed { .. } => "prepare",
            Self::QueryFailed { .. } => "execute",
            Self::RowLoadFailed { .. } => "row_load",
            Self::QueryGetValueFailed { .. } => "value_decode",
            Self::Internal(_) => "internal",
        }
    }
}

pub type TursodResult<T> = Result<T, TursodError>;
