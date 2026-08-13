use std::fmt;
use tracing::{Event, Subscriber, field};
use tracing_subscriber::{
    EnvFilter,
    fmt::{
        FmtContext, FormatEvent, FormatFields, FormattedFields,
        format::Writer,
        time::{FormatTime, SystemTime},
    },
    registry::LookupSpan,
};

const REQUEST_SPAN_NAME: &str = "http_request";
const STATEMENT_SPAN_NAME: &str = "sql_statement";

/// Formats one flat JSON object per event.
///
/// Span fields are included selectively rather than emitting the complete span
/// stack on every log line. The terminal HTTP log receives the request fields,
/// terminal SQL logs receive the statement fields, and every other event inside
/// a request receives only its request ID for correlation.
pub(crate) struct JsonEventFormatter;

pub(crate) fn initialize(filter: EnvFilter) {
    // `JsonEventFormatter` reads span fields from `FormattedFields` as JSON.
    // Keep `.json()` here, next to the formatter, so production cannot
    // accidentally use the default text field formatter and lose context.
    let _ = tracing_subscriber::fmt()
        .json()
        .event_format(JsonEventFormatter)
        .with_env_filter(filter)
        .try_init();
}

impl<S, N> FormatEvent<S, N> for JsonEventFormatter
where
    S: Subscriber + for<'lookup> LookupSpan<'lookup>,
    N: for<'writer> FormatFields<'writer> + 'static,
{
    fn format_event(
        &self,
        context: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let mut object = serde_json::Map::new();
        let mut timestamp = String::new();
        SystemTime.format_time(&mut Writer::new(&mut timestamp))?;
        object.insert("timestamp".to_owned(), timestamp.into());
        object.insert(
            "level".to_owned(),
            serde_json::Value::String(event.metadata().level().to_string()),
        );

        let event_target = event.metadata().target();
        let mut event_fields = serde_json::Map::new();
        event.record(&mut EventFieldVisitor(&mut event_fields));
        let event_message = event_fields
            .get("message")
            .and_then(serde_json::Value::as_str);
        let include_request_fields =
            event_target == "tursod::http" && event_message == Some("request completed");
        let include_statement_fields = event_target == "tursod::sql"
            && matches!(
                event_message,
                Some("query completed" | "query failed" | "query cancelled")
            );

        if let Some(scope) = context.event_scope() {
            for span in scope.from_root() {
                let span_name = span.metadata().name();
                let include_all_fields = (include_request_fields && span_name == REQUEST_SPAN_NAME)
                    || (include_statement_fields && span_name == STATEMENT_SPAN_NAME);

                let extensions = span.extensions();
                let Some(fields) = extensions.get::<FormattedFields<N>>() else {
                    continue;
                };
                let Ok(serde_json::Value::Object(span_fields)) =
                    serde_json::from_str::<serde_json::Value>(fields)
                else {
                    continue;
                };

                if include_all_fields {
                    object.extend(span_fields);
                } else if span_name == REQUEST_SPAN_NAME
                    && let Some(request_id) = span_fields.get("request_id")
                {
                    object.insert("request_id".to_owned(), request_id.clone());
                }
            }
        }

        // Event fields take precedence over values recorded on their span.
        object.extend(event_fields);
        object.insert(
            "target".to_owned(),
            serde_json::Value::String(event_target.to_owned()),
        );

        serde_json::to_writer(&mut WriteAdapter(&mut writer), &object).map_err(|_| fmt::Error)?;
        writeln!(writer)
    }
}

#[cfg(test)]
pub(crate) static TEST_SUBSCRIBER_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[cfg(test)]
pub(crate) fn initialize_test_subscriber() {
    static INITIALIZE: std::sync::Once = std::sync::Once::new();

    INITIALIZE.call_once(|| {
        let subscriber = tracing_subscriber::fmt()
            .with_writer(std::io::sink)
            .finish();
        let _ = tracing::subscriber::set_global_default(subscriber);
    });
}

struct EventFieldVisitor<'a>(&'a mut serde_json::Map<String, serde_json::Value>);

impl field::Visit for EventFieldVisitor<'_> {
    fn record_f64(&mut self, field: &field::Field, value: f64) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_i64(&mut self, field: &field::Field, value: i64) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_u64(&mut self, field: &field::Field, value: u64) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_bool(&mut self, field: &field::Field, value: bool) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_str(&mut self, field: &field::Field, value: &str) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_bytes(&mut self, field: &field::Field, value: &[u8]) {
        self.0.insert(field.name().to_owned(), value.into());
    }

    fn record_debug(&mut self, field: &field::Field, value: &dyn fmt::Debug) {
        self.0
            .insert(field.name().to_owned(), format!("{value:?}").into());
    }
}

struct WriteAdapter<'a, 'writer>(&'a mut Writer<'writer>);

impl std::io::Write for WriteAdapter<'_, '_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        let text = std::str::from_utf8(bytes)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        self.0
            .write_str(text)
            .map_err(|_| std::io::Error::other("failed to format log event"))?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
