use crate::{
    TursodError, TursodResult,
    dto::{ExecuteReponse, ExecuteRequest},
    state::DbsState,
};
use axum::{
    Json, Router,
    extract::{Path as AxumPath, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_derive::Serialize;
use std::sync::Arc;

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
        let status = match &error {
            TursodError::InvalidConnectionId { .. } => StatusCode::BAD_REQUEST,
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
                message: error.to_string(),
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

impl HttpHandlers {
    pub(crate) fn router(dbs_state: Arc<DbsState>) -> Router {
        Router::new()
            .route("/health", get(Self::health))
            .route("/dbs/{db_name}/conn/{id}/exec", post(Self::exec))
            .with_state(dbs_state)
    }

    async fn health() -> StatusCode {
        StatusCode::OK
    }

    async fn exec(
        State(state): State<Arc<DbsState>>,
        AxumPath((db_name, conn_id)): AxumPath<(String, String)>,
        Json(payload): Json<ExecuteRequest>,
    ) -> Result<(StatusCode, Json<ExecuteReponse>), ApiError> {
        let cn_id = Self::parse_conn_id(&conn_id)?;

        state.open_conn(&db_name, &cn_id).await?;
        let results = state
            .exec_stmts(&db_name, &cn_id, payload.statements)
            .await?;

        Ok((StatusCode::OK, Json(ExecuteReponse { results })))
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
    use crate::{dto::ExecuteReponse, state::DbsState};
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

    fn request(path: &str, body: Value) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn executes_tagged_values_and_transactions_on_a_new_connection() {
        let directory = TempDir::new().unwrap();
        let app = HttpHandlers::router(Arc::new(DbsState::new(directory.path().into())));
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
        let payload: ExecuteReponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(payload.results.len(), 6);
        assert_eq!(
            serde_json::to_value(&payload.results[5].rows).unwrap(),
            json!([[{ "type": "integer", "value": 7 }, { "type": "text", "value": "hello" }, { "type": "blob", "value": [1, 2, 255] }]])
        );
    }

    #[tokio::test]
    async fn returns_a_structured_error_for_an_invalid_connection_id() {
        let directory = TempDir::new().unwrap();
        let app = HttpHandlers::router(Arc::new(DbsState::new(directory.path().into())));

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
    async fn reports_healthy_without_opening_a_database() {
        let directory = TempDir::new().unwrap();
        let app = HttpHandlers::router(Arc::new(DbsState::new(directory.path().into())));
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
        let app = HttpHandlers::router(Arc::clone(&state));
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
        let payload: ExecuteReponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            serde_json::to_value(&payload.results[0].rows).unwrap(),
            json!([[{ "type": "text", "value": "still here" }]])
        );
    }
}
