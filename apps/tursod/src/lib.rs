mod dto;
mod errors;
mod handlers;
mod http_logging;
mod logging;
mod monitoring;
mod schema_repair;
mod state;

pub use errors::{TursodError, TursodResult};

use anyhow::Context;
use std::{env, net::IpAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::time::sleep;
use tracing_subscriber::EnvFilter;

use crate::{
    handlers::HttpHandlers,
    state::{CONNECTION_IDLE_TIMEOUT, DbsState, SLOW_QUERY_THRESHOLD},
};

pub async fn run() -> anyhow::Result<()> {
    let sentry_monitor = monitoring::initialize_sentry()?;
    logging::initialize(
        EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("tursod=info,tower_http=info")),
        sentry_monitor.is_enabled(),
        sentry_monitor.tracing_enabled(),
    );

    tracing::info!(
        sentry_enabled = sentry_monitor.is_enabled(),
        sentry_tracing_enabled = sentry_monitor.tracing_enabled(),
        sentry_traces_sample_rate = sentry_monitor.traces_sample_rate(),
        "Sentry initialized"
    );
    let result = run_server(
        sentry_monitor.is_enabled(),
        sentry_monitor.tracing_enabled(),
    )
    .await;
    if let Err(error) = &result {
        sentry::capture_error(error.root_cause());
    }
    result
}

async fn run_server(sentry_enabled: bool, sentry_tracing_enabled: bool) -> anyhow::Result<()> {
    let db_dir = match env::var("TURSOD_DB_PATH") {
        Ok(path) => PathBuf::from(path),
        Err(_) => env::current_dir()?.join("db"),
    };
    std::fs::create_dir_all(&db_dir)?;
    let dbs_state = Arc::new(DbsState::new(db_dir.clone()));
    let auth_token = env::var("WBD_TURSOD_AUTH_TOKEN")
        .context("WBD_TURSOD_AUTH_TOKEN is required")?
        .trim()
        .to_owned();
    anyhow::ensure!(
        !auth_token.is_empty(),
        "WBD_TURSOD_AUTH_TOKEN must not be empty"
    );

    let app = HttpHandlers::router(
        Arc::clone(&dbs_state),
        auth_token,
        sentry_enabled,
        sentry_tracing_enabled,
    );

    let host = env::var("TURSOD_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let host = host
        .parse::<IpAddr>()
        .with_context(|| format!("invalid TURSOD_HOST `{host}`"))?;
    let port = env::var("TURSOD_PORT")
        .or_else(|_| env::var("PORT"))
        .unwrap_or_else(|_| "3000".to_owned());
    let port = port
        .parse::<u16>()
        .with_context(|| format!("invalid TURSOD_PORT/PORT `{port}`"))?;
    let listener = tokio::net::TcpListener::bind((host, port)).await?;
    let bound_address = listener.local_addr()?;
    tracing::info!(
        %bound_address,
        service_version = env!("CARGO_PKG_VERSION"),
        git_commit = env::var("TURSOD_GIT_COMMIT").unwrap_or_else(|_| "unknown".to_owned()),
        rust_version = env::var("TURSOD_RUST_VERSION").unwrap_or_else(|_| "unknown".to_owned()),
        fly_machine_id = env::var("FLY_MACHINE_ID").unwrap_or_else(|_| "unknown".to_owned()),
        fly_region = env::var("FLY_REGION").unwrap_or_else(|_| "unknown".to_owned()),
        fly_image_ref = env::var("FLY_IMAGE_REF").unwrap_or_else(|_| "unknown".to_owned()),
        database_path = %db_dir.display(),
        connection_idle_timeout_seconds = CONNECTION_IDLE_TIMEOUT.as_secs(),
        slow_query_threshold_ms = SLOW_QUERY_THRESHOLD.as_millis() as u64,
        "tursod listening"
    );

    tokio::spawn(async move {
        let mut cleanup_runs = 0_u8;
        loop {
            sleep(Duration::from_millis(10_000)).await;
            let stats = dbs_state.clean_conns().await;
            if stats.database_slots > 0 || stats.connections > 0 {
                tracing::info!(
                    evicted_database_slots = stats.database_slots,
                    evicted_connections = stats.connections,
                    "tursod cleanup evicted stale state"
                );
            }

            cleanup_runs += 1;
            if cleanup_runs == 6 {
                cleanup_runs = 0;
                match dbs_state.telemetry_snapshot().await {
                    Ok(snapshot) => tracing::info!(
                        database_slots = snapshot.database_slots,
                        initialized_databases = snapshot.initialized_databases,
                        connection_slots = snapshot.connection_slots,
                        initialized_connections = snapshot.initialized_connections,
                        active_batches = snapshot.active_batches,
                        waiting_queries = snapshot.waiting_queries,
                        executing_queries = snapshot.executing_queries,
                        database_files = snapshot.database_files,
                        database_bytes = snapshot.database_bytes,
                        wal_bytes = snapshot.wal_bytes,
                        filesystem_available_bytes = snapshot.filesystem_available_bytes,
                        "tursod service state"
                    ),
                    Err(error) => tracing::error!(
                        error = ?error,
                        "failed to collect tursod service state"
                    ),
                }
            }
        }
    });

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(?error, "failed to install Ctrl-C shutdown handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::error!(?error, "failed to install SIGTERM shutdown handler");
            }
        }
    };

    #[cfg(unix)]
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    #[cfg(not(unix))]
    ctrl_c.await;

    tracing::info!("tursod shutdown signal received");
}

#[cfg(test)]
mod tests {
    use crate::logging::{
        LogBuffer, LogWriter, QUERY_COMPLETED_MESSAGE, REQUEST_COMPLETED_MESSAGE,
    };
    use serde_json::Value;
    use tracing::{Instrument, instrument::WithSubscriber};

    #[tokio::test]
    async fn structured_logs_include_only_relevant_span_fields_and_request_id() {
        crate::logging::initialize_test_subscriber();
        let _subscriber_guard = crate::logging::TEST_SUBSCRIBER_LOCK.lock().await;
        let output = LogBuffer::default();
        let writer = output.clone();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .event_format(crate::logging::JsonEventFormatter)
            .with_writer(move || LogWriter(writer.clone()))
            .finish();

        async {
            let request = tracing::info_span!(
                "http_request",
                request_id = "test-request-id",
                client_ip = "203.0.113.7",
                path = "/dbs/test/conn/test/exec"
            );
            async {
                tracing::info!(target: "tursod::http", "request started");
                tracing::info!(target: "tursod::state", statement_count = 1, "statement batch completed");
                let query = tracing::info_span!(
                    target: "tursod::sql",
                    "sql_statement",
                    operation = "SELECT",
                    sql = "SELECT 1"
                );
                async {
                    tracing::info!(
                        target: "tursod::sql",
                        rows = 1,
                        message = QUERY_COMPLETED_MESSAGE
                    );
                }
                    .instrument(query)
                    .await;
                tracing::info!(
                    target: "tursod::http",
                    status = 200,
                    message = REQUEST_COMPLETED_MESSAGE
                );
            }
            .instrument(request)
            .await;
        }
        .with_subscriber(subscriber)
        .await;

        let bytes = output.0.lock().unwrap();
        let events = std::str::from_utf8(&bytes)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .collect::<Vec<_>>();
        let request_started = events
            .iter()
            .find(|event| event["message"] == "request started")
            .unwrap();
        assert_eq!(request_started["request_id"], "test-request-id");
        assert!(request_started.get("client_ip").is_none());
        assert!(request_started.get("path").is_none());

        let batch = events
            .iter()
            .find(|event| event["message"] == "statement batch completed")
            .unwrap();
        assert_eq!(batch["request_id"], "test-request-id");
        assert_eq!(batch["statement_count"], 1);
        assert!(batch.get("client_ip").is_none());
        assert!(batch.get("path").is_none());
        assert!(batch.get("sql").is_none());

        let query = events
            .iter()
            .find(|event| event["message"] == "query completed")
            .unwrap();
        assert_eq!(query["request_id"], "test-request-id");
        assert_eq!(query["operation"], "SELECT");
        assert_eq!(query["sql"], "SELECT 1");
        assert_eq!(query["rows"], 1);
        assert!(query.get("client_ip").is_none());
        assert!(query.get("spans").is_none());

        let request = events
            .iter()
            .find(|event| event["message"] == "request completed")
            .unwrap();
        assert_eq!(request["request_id"], "test-request-id");
        assert_eq!(request["client_ip"], "203.0.113.7");
        assert_eq!(request["path"], "/dbs/test/conn/test/exec");
        assert_eq!(request["status"], 200);
        assert!(request.get("sql").is_none());
        assert!(request.get("spans").is_none());

        assert_eq!(
            events
                .iter()
                .filter(|event| event.get("path").is_some())
                .count(),
            1
        );
    }
}
