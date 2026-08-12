use crate::{
    TursodError, TursodResult,
    dto::{ExecuteRequest, ExecuteResponse},
    http_logging::with_http_logging,
    state::DbsState,
};
use axum::{
    Json, Router,
    extract::{Path as AxumPath, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_derive::Serialize;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use subtle::ConstantTimeEq;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiErrorBody {
    code: &'static str,
    message: String,
}

struct ApiError {
    status: StatusCode,
    body: ApiErrorBody,
}

impl ApiError {
    fn new(error: TursodError) -> Self {
        tracing::Span::current().record("error_code", error.code());
        tracing::Span::current().record("error_stage", error.stage());
        tracing::error!(
            code = error.code(),
            error_stage = error.stage(),
            error = ?error,
            "tursod request failed"
        );
        let status = match &error {
            TursodError::InvalidConnectionId { .. } | TursodError::BadRequest => {
                StatusCode::BAD_REQUEST
            }
            TursodError::DatabaseNotOpened { .. } | TursodError::ConnectionNotFound { .. } => {
                StatusCode::NOT_FOUND
            }
            TursodError::DatabaseNotInitialized { .. } => StatusCode::CONFLICT,
            TursodError::PrepareFailed { .. }
            | TursodError::QueryFailed { .. }
            | TursodError::QueryGetValueFailed { .. }
            | TursodError::RowLoadFailed { .. }
            | TursodError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        Self {
            status,
            body: ApiErrorBody {
                code: error.code(),
                message: Self::client_message(&error).to_owned(),
            },
        }
    }

    fn client_message(error: &TursodError) -> &'static str {
        match error {
            TursodError::InvalidConnectionId { .. } => "invalid connection id",
            TursodError::DatabaseNotOpened { .. } => "database is not opened",
            TursodError::PrepareFailed { .. } => "statement preparation failed",
            TursodError::QueryFailed { .. } => "statement query failed",
            TursodError::QueryGetValueFailed { .. } => "statement value extraction failed",
            TursodError::RowLoadFailed { .. } => "statement row loading failed",
            TursodError::DatabaseNotInitialized { .. } => "database is not initialized",
            TursodError::ConnectionNotFound { .. } => "connection not found",
            TursodError::BadRequest => "invalid request",
            TursodError::Internal(_) => "internal server error",
        }
    }

    fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            body: ApiErrorBody {
                code: "UNAUTHORIZED",
                message: "missing or invalid authentication token".to_owned(),
            },
        }
    }
}

impl From<TursodError> for ApiError {
    fn from(error: TursodError) -> Self {
        Self::new(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

pub(crate) struct HttpHandlers;

struct HandlerState {
    dbs: Arc<DbsState>,
    auth_token_hash: [u8; 32],
}

impl HttpHandlers {
    pub(crate) fn router(dbs_state: Arc<DbsState>, auth_token: String) -> Router {
        let auth_token_hash = Sha256::digest(auth_token.as_bytes()).into();
        let router = Router::new()
            .route("/health", get(Self::health))
            .route("/dbs/{db_name}/conn/{id}/exec", post(Self::exec))
            .with_state(Arc::new(HandlerState {
                dbs: dbs_state,
                auth_token_hash,
            }));

        with_http_logging(router)
    }

    async fn health() -> StatusCode {
        let span = tracing::Span::current();
        span.record("route", "/health");
        span.record("auth", "not_required");
        StatusCode::OK
    }

    async fn exec(
        State(state): State<Arc<HandlerState>>,
        AxumPath((db_name, conn_id)): AxumPath<(String, String)>,
        headers: HeaderMap,
        Json(payload): Json<ExecuteRequest>,
    ) -> Result<(StatusCode, Json<ExecuteResponse>), ApiError> {
        let span = tracing::Span::current();
        span.record("route", "/dbs/{db_name}/conn/{id}/exec");
        span.record("db_name", db_name.as_str());
        span.record("conn_id", conn_id.as_str());
        span.record("statement_count", payload.statements.len());

        if !Self::is_authorized(&headers, &state.auth_token_hash) {
            span.record("auth", "invalid");
            span.record("error_code", "UNAUTHORIZED");
            span.record("error_stage", "auth");
            tracing::warn!("request authentication failed");
            return Err(ApiError::unauthorized());
        }
        span.record("auth", "valid");

        let cn_id = Self::parse_conn_id(&conn_id)?;

        let open_stats = state.dbs.open_conn(&db_name, &cn_id).await?;
        span.record("database_reused", open_stats.database_reused);
        span.record("connection_reused", open_stats.connection_reused);
        span.record("database_open_ms", open_stats.database_open_ms);
        span.record("connection_open_ms", open_stats.connection_open_ms);
        tracing::info!(
            database_reused = open_stats.database_reused,
            connection_reused = open_stats.connection_reused,
            database_open_ms = open_stats.database_open_ms,
            connection_open_ms = open_stats.connection_open_ms,
            "database connection ready"
        );
        let results = state
            .dbs
            .exec_stmts(&db_name, &cn_id, payload.statements)
            .await?;

        Ok((StatusCode::OK, Json(ExecuteResponse { results })))
    }

    fn is_authorized(headers: &HeaderMap, expected_hash: &[u8; 32]) -> bool {
        let Some(provided) = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
        else {
            return false;
        };

        let provided_hash: [u8; 32] = Sha256::digest(provided.as_bytes()).into();
        bool::from(provided_hash.ct_eq(expected_hash))
    }

    fn parse_conn_id(id: &str) -> TursodResult<uuid::Uuid> {
        uuid::Uuid::parse_str(id).map_err(|source| TursodError::InvalidConnectionId {
            connection_id: id.to_owned(),
            source,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::HttpHandlers;
    use crate::{dto::ExecuteResponse, state::DbsState};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use pretty_assertions::assert_eq;
    use serde_json::{Value, json};
    use std::{sync::Arc, time::Duration};
    use tempfile::TempDir;
    use tokio::time::advance;
    use tower::ServiceExt;

    const AUTH_TOKEN: &str = "test-secret";

    fn request(path: &str, body: Value) -> Request<Body> {
        request_with_token(path, body, Some(AUTH_TOKEN))
    }

    fn request_with_token(path: &str, body: Value, token: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json");
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }

        builder.body(Body::from(body.to_string())).unwrap()
    }

    fn app(directory: &TempDir) -> axum::Router {
        HttpHandlers::router(
            Arc::new(DbsState::new(directory.path().into())),
            AUTH_TOKEN.to_owned(),
        )
    }

    #[tokio::test]
    async fn executes_tagged_values_and_transactions_on_a_new_connection() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);
        let connection_id = "0198b10a-b15e-7e6a-b426-c491007f4b65";
        let base_path = format!("/dbs/test-db/conn/{connection_id}");

        let response = app
            .clone()
            .oneshot(request(
                &format!("{base_path}/exec"),
                json!({
                    "statements": [
                        { "sql": "CREATE TABLE values_table (id INTEGER, text_value TEXT, blob_value BLOB)", "args": [] },
                        {
                            "sql": "INSERT INTO values_table VALUES (?, ?, ?)",
                            "args": [
                                { "type": "integer", "value": 7 },
                                { "type": "text", "value": "hello" },
                                { "type": "blob", "value": [1, 2, 255] }
                            ]
                        },
                        { "sql": "BEGIN TRANSACTION", "args": [] },
                        { "sql": "INSERT INTO values_table VALUES (8, 'rolled back', NULL)", "args": [] },
                        { "sql": "ROLLBACK", "args": [] },
                        { "sql": "SELECT id, text_value, blob_value FROM values_table ORDER BY id", "args": [] }
                    ]
                }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let payload: ExecuteResponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(payload.results.len(), 6);
        assert_eq!(
            serde_json::to_value(&payload.results[5].rows).unwrap(),
            json!([[{ "type": "integer", "value": 7 }, { "type": "text", "value": "hello" }, { "type": "blob", "value": [1, 2, 255] }]])
        );
    }

    #[tokio::test]
    async fn returns_a_structured_error_for_an_invalid_connection_id() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);

        let response = app
            .oneshot(request(
                "/dbs/test-db/conn/not-a-uuid/exec",
                json!({ "statements": [] }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes).unwrap()["code"],
            "INVALID_CONNECTION_ID"
        );
    }

    #[tokio::test]
    async fn rejects_missing_and_invalid_authentication_tokens() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);
        let path = "/dbs/test-db/conn/0198b10a-b15e-7e6a-b426-c491007f4b65/exec";
        let body = json!({ "statements": [] });

        let missing = app
            .clone()
            .oneshot(request_with_token(path, body.clone(), None))
            .await
            .unwrap();
        let invalid = app
            .oneshot(request_with_token(path, body, Some("wrong-secret")))
            .await
            .unwrap();

        assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(invalid.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn propagates_or_generates_a_request_id() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);
        let path = "/dbs/test-db/conn/0198b10a-b15e-7e6a-b426-c491007f4b65/exec";

        let mut supplied_request = request(path, json!({ "statements": [] }));
        supplied_request
            .headers_mut()
            .insert("x-request-id", "caller-request-id".parse().unwrap());
        let supplied = app.clone().oneshot(supplied_request).await.unwrap();
        let generated = app
            .oneshot(request(path, json!({ "statements": [] })))
            .await
            .unwrap();

        assert_eq!(supplied.headers()["x-request-id"], "caller-request-id");
        let generated_id = generated.headers()["x-request-id"].to_str().unwrap();
        uuid::Uuid::parse_str(generated_id).expect("generated request id is a UUID");
    }

    #[tokio::test]
    async fn statement_errors_do_not_expose_sql_or_driver_details() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);
        let secret_sql = "SELECT secret_sql FROM missing_table";

        let response = app
            .oneshot(request(
                "/dbs/test-db/conn/0198b10a-b15e-7e6a-b426-c491007f4b65/exec",
                json!({ "statements": [{ "sql": secret_sql, "args": [] }] }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        let message = body["message"].as_str().unwrap();
        assert!(!message.contains(secret_sql));
        assert!(!message.contains("missing_table"));
    }

    #[tokio::test]
    async fn reports_healthy_without_opening_a_database() {
        let directory = TempDir::new().unwrap();
        let app = app(&directory);
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test(start_paused = true)]
    async fn exec_recreates_an_evicted_connection() {
        let directory = TempDir::new().unwrap();
        let state = Arc::new(DbsState::new(directory.path().into()));
        let app = HttpHandlers::router(Arc::clone(&state), AUTH_TOKEN.to_owned());
        let connection_id = "0198b10a-b15e-7e6a-b426-c491007f4b65";
        let base_path = format!("/dbs/test-db/conn/{connection_id}");

        let response = app
            .clone()
            .oneshot(request(
                &format!("{base_path}/exec"),
                json!({
                    "statements": [
                        { "sql": "CREATE TABLE messages (body TEXT NOT NULL)", "args": [] },
                        { "sql": "INSERT INTO messages VALUES ('still here')", "args": [] }
                    ]
                }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        advance(Duration::from_secs(60)).await;
        state.clean_conns().await;
        let response = app
            .oneshot(request(
                &format!("{base_path}/exec"),
                json!({
                    "statements": [
                        { "sql": "SELECT body FROM messages", "args": [] }
                    ]
                }),
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let payload: ExecuteResponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            serde_json::to_value(&payload.results[0].rows).unwrap(),
            json!([[{ "type": "text", "value": "still here" }]])
        );
    }
}
