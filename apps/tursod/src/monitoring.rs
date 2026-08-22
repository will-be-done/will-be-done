use anyhow::Context;
use sentry::{ClientInitGuard, ClientOptions};
use std::{borrow::Cow, env};

const DEFAULT_TRACES_SAMPLE_RATE: f32 = 0.0;

pub(crate) struct SentryMonitor {
    _guard: Option<ClientInitGuard>,
    traces_sample_rate: f32,
}

impl SentryMonitor {
    pub(crate) fn is_enabled(&self) -> bool {
        self._guard.is_some()
    }

    pub(crate) fn tracing_enabled(&self) -> bool {
        self.is_enabled() && self.traces_sample_rate > 0.0
    }

    pub(crate) fn traces_sample_rate(&self) -> f32 {
        self.traces_sample_rate
    }
}

pub(crate) fn initialize_sentry() -> anyhow::Result<SentryMonitor> {
    let Some(dsn) = non_empty_env("WBD_SENTRY_DSN") else {
        return Ok(SentryMonitor {
            _guard: None,
            traces_sample_rate: DEFAULT_TRACES_SAMPLE_RATE,
        });
    };
    let traces_sample_rate =
        parse_traces_sample_rate(non_empty_env("WBD_SENTRY_TRACES_SAMPLE_RATE").as_deref())?;
    let dsn = dsn
        .parse::<sentry::types::Dsn>()
        .context("WBD_SENTRY_DSN is not a valid DSN")?;

    let release = non_empty_env("WBD_SENTRY_RELEASE")
        .map(Cow::Owned)
        .or_else(|| sentry::release_name!());
    let mut options = ClientOptions::new()
        .maybe_release(release)
        .send_default_pii(false);
    if traces_sample_rate > 0.0 {
        options = options.traces_sample_rate(traces_sample_rate);
    }
    if let Some(environment) = non_empty_env("WBD_SENTRY_ENVIRONMENT") {
        options = options.environment(environment);
    }

    Ok(SentryMonitor {
        _guard: Some(sentry::init((dsn, options))),
        traces_sample_rate,
    })
}

fn parse_traces_sample_rate(value: Option<&str>) -> anyhow::Result<f32> {
    let Some(value) = value else {
        return Ok(DEFAULT_TRACES_SAMPLE_RATE);
    };
    let rate = value
        .parse::<f32>()
        .context("WBD_SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1")?;
    anyhow::ensure!(
        rate.is_finite() && (0.0..=1.0).contains(&rate),
        "WBD_SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1"
    );
    Ok(rate)
}

fn non_empty_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_TRACES_SAMPLE_RATE, parse_traces_sample_rate};

    #[test]
    fn disables_tracing_by_default() {
        assert_eq!(
            parse_traces_sample_rate(None).unwrap(),
            DEFAULT_TRACES_SAMPLE_RATE
        );
    }

    #[test]
    fn accepts_rates_from_zero_to_one() {
        assert_eq!(parse_traces_sample_rate(Some("0")).unwrap(), 0.0);
        assert_eq!(parse_traces_sample_rate(Some("0.25")).unwrap(), 0.25);
        assert_eq!(parse_traces_sample_rate(Some("1")).unwrap(), 1.0);
    }

    #[test]
    fn rejects_invalid_rates() {
        for rate in ["-0.1", "1.1", "NaN", "invalid"] {
            assert!(parse_traces_sample_rate(Some(rate)).is_err());
        }
    }
}
