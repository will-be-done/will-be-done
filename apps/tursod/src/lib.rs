mod dto;
mod errors;
mod handlers;
mod http_logging;
mod state;

pub use errors::{TursodError, TursodResult};

use anyhow::Context;
use std::{env, net::IpAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::time::sleep;
use tracing_subscriber::EnvFilter;

use crate::{handlers::HttpHandlers, state::DbsState};

pub async fn run() -> anyhow::Result<()> {
    let _ = tracing_subscriber::fmt()
        .json()
        .flatten_event(true)
        .with_current_span(false)
        .with_span_list(true)
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("tursod=info,tower_http=info")),
        )
        .try_init();

    let db_dir = match env::var("TURSOD_DB_PATH") {
        Ok(path) => PathBuf::from(path),
        Err(_) => env::current_dir()?.join("db"),
    };
    std::fs::create_dir_all(&db_dir)?;
    let dbs_state = Arc::new(DbsState::new(db_dir.clone()));
    let auth_token = env::var("TURSOD_AUTH_TOKEN")
        .context("TURSOD_AUTH_TOKEN is required")?
        .trim()
        .to_owned();
    anyhow::ensure!(
        !auth_token.is_empty(),
        "TURSOD_AUTH_TOKEN must not be empty"
    );

    let app = HttpHandlers::router(Arc::clone(&dbs_state), auth_token);

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
        connection_idle_timeout_seconds = 60,
        slow_query_threshold_ms = 500,
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
    use serde_json::Value;
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };
    use tracing::{Instrument, instrument::WithSubscriber};

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

    #[tokio::test]
    async fn structured_logs_include_the_full_async_span_stack() {
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
            let request = tracing::info_span!(
                "http_request",
                request_id = "test-request-id",
                client_ip = "203.0.113.7"
            );
            async {
                let query = tracing::info_span!("sql_statement", sql = "SELECT 1");
                async { tracing::info!("query completed") }
                    .instrument(query)
                    .await;
            }
            .instrument(request)
            .await;
        }
        .with_subscriber(subscriber)
        .await;

        let bytes = output.0.lock().unwrap();
        let event: Value = serde_json::from_slice(&bytes).unwrap();
        let spans = event["spans"].as_array().unwrap();
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0]["request_id"], "test-request-id");
        assert_eq!(spans[0]["client_ip"], "203.0.113.7");
        assert_eq!(spans[1]["sql"], "SELECT 1");
    }
}
