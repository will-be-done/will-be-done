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

#[cfg(test)]
mod tests {
    use super::HttpHandlers;
    use crate::{dto::ExecuteReponse, state::DbsState};
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use std::sync::Arc;
    use tempfile::TempDir;
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
    async fn opens_connection_and_executes_tagged_values_and_transactions() {
        let directory = TempDir::new().unwrap();
        let app = HttpHandlers::router(Arc::new(DbsState::new(directory.path().into())));
        let connection_id = "0198b10a-b15e-7e6a-b426-c491007f4b65";
        let base_path = format!("/dbs/test-db/conn/{connection_id}");

        let response = app
            .clone()
            .oneshot(request(&base_path, json!({})))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let response = app
            .clone()
            .oneshot(request(
                &format!("{base_path}/exec"),
                json!({
                    "statements": [
                        { "sql": "CREATE TABLE values_table (id INTEGER, text_value TEXT, blob_value BLOB)", "namedArgs": [] },
                        {
                            "sql": "INSERT INTO values_table VALUES (?1, ?2, ?3)",
                            "namedArgs": [
                                { "name": "?1", "value": { "type": "integer", "value": 7 } },
                                { "name": "?2", "value": { "type": "text", "value": "hello" } },
                                { "name": "?3", "value": { "type": "blob", "value": [1, 2, 255] } }
                            ]
                        },
                        { "sql": "BEGIN TRANSACTION", "namedArgs": [] },
                        { "sql": "INSERT INTO values_table VALUES (8, 'rolled back', NULL)", "namedArgs": [] },
                        { "sql": "ROLLBACK", "namedArgs": [] },
                        { "sql": "SELECT id, text_value, blob_value FROM values_table ORDER BY id", "namedArgs": [] }
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
    async fn returns_structured_errors_for_invalid_and_missing_connections() {
        let directory = TempDir::new().unwrap();
        let app = HttpHandlers::router(Arc::new(DbsState::new(directory.path().into())));

        let response = app
            .clone()
            .oneshot(request("/dbs/test-db/conn/not-a-uuid", json!({})))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes).unwrap()["code"],
            "INVALID_CONNECTION_ID"
        );

        let response = app
            .oneshot(request(
                "/dbs/test-db/conn/0198b10a-b15e-7e6a-b426-c491007f4b65/exec",
                json!({ "statements": [] }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes).unwrap()["code"],
            "DATABASE_NOT_OPENED"
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
            .route("/dbs/{db_name}/conn/{id}", post(Self::open_conn))
            .route("/dbs/{db_name}/conn/{id}/exec", post(Self::exec))
            .with_state(dbs_state)
    }

    async fn health() -> StatusCode {
        StatusCode::OK
    }

    async fn open_conn(
        State(state): State<Arc<DbsState>>,
        AxumPath((db_name, conn_id)): AxumPath<(String, String)>,
    ) -> Result<StatusCode, ApiError> {
        let cn_id = Self::parse_conn_id(&conn_id)?;

        state.open_conn(&db_name, &cn_id).await?;

        Ok(StatusCode::NO_CONTENT)
    }

    async fn exec(
        State(state): State<Arc<DbsState>>,
        AxumPath((db_name, conn_id)): AxumPath<(String, String)>,
        Json(payload): Json<ExecuteRequest>,
    ) -> Result<(StatusCode, Json<ExecuteReponse>), ApiError> {
        let cn_id = Self::parse_conn_id(&conn_id)?;

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
