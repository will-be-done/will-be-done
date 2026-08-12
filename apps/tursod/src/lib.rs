mod dto;
mod errors;
mod handlers;
mod state;

pub use errors::{TursodError, TursodResult};

use anyhow::Context;
use std::{env, net::IpAddr, path::PathBuf, sync::Arc, time::Duration};
use tokio::time::sleep;

use crate::{handlers::HttpHandlers, state::DbsState};

pub async fn run() -> anyhow::Result<()> {
    let db_dir = match env::var("TURSOD_DB_PATH") {
        Ok(path) => PathBuf::from(path),
        Err(_) => env::current_dir()?.join("db"),
    };
    std::fs::create_dir_all(&db_dir)?;
    let dbs_state = Arc::new(DbsState::new(db_dir));

    let app = HttpHandlers::router(Arc::clone(&dbs_state));

    let host = env::var("TURSOD_HOST").unwrap_or_else(|_| "0.0.0.0".to_owned());
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

    tokio::spawn(async move {
        loop {
            sleep(Duration::from_millis(10_000)).await;
            dbs_state.clean_conns().await;
        }
    });

    axum::serve(listener, app).await?;

    Ok(())
}
