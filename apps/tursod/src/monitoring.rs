use anyhow::Context;
use sentry::{ClientInitGuard, ClientOptions};
use std::{borrow::Cow, env};

pub(crate) struct SentryMonitor {
    _guard: Option<ClientInitGuard>,
}

impl SentryMonitor {
    pub(crate) fn is_enabled(&self) -> bool {
        self._guard.is_some()
    }
}

pub(crate) fn initialize_sentry() -> anyhow::Result<SentryMonitor> {
    let Some(dsn) = non_empty_env("WBD_SENTRY_DSN") else {
        return Ok(SentryMonitor { _guard: None });
    };
    let dsn = dsn
        .parse::<sentry::types::Dsn>()
        .context("WBD_SENTRY_DSN is not a valid DSN")?;

    let release = non_empty_env("WBD_SENTRY_RELEASE")
        .map(Cow::Owned)
        .or_else(|| sentry::release_name!());
    let mut options = ClientOptions::new()
        .maybe_release(release)
        .traces_sample_rate(0.1)
        .send_default_pii(false);
    if let Some(environment) = non_empty_env("WBD_SENTRY_ENVIRONMENT") {
        options = options.environment(environment);
    }

    Ok(SentryMonitor {
        _guard: Some(sentry::init((dsn, options))),
    })
}

fn non_empty_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
