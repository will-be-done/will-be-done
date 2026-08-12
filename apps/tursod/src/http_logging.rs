use axum::{
    Router,
    body::{Body, HttpBody},
    extract::ConnectInfo,
    http::{Request, Response, header::USER_AGENT},
    middleware::{self, Next},
};
use std::{
    net::{IpAddr, SocketAddr},
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use tower::ServiceBuilder;
use tower_http::{
    ServiceBuilderExt,
    classify::ServerErrorsFailureClass,
    request_id::{MakeRequestUuid, RequestId},
    trace::TraceLayer,
};
use tracing::{Span, field};

const FLY_CLIENT_IP: &str = "fly-client-ip";
const FLY_REGION: &str = "fly-region";
static ACTIVE_REQUESTS: AtomicUsize = AtomicUsize::new(0);

struct ActiveRequestGuard;

impl Drop for ActiveRequestGuard {
    fn drop(&mut self) {
        ACTIVE_REQUESTS.fetch_sub(1, Ordering::Relaxed);
    }
}

#[derive(Debug, PartialEq, Eq)]
struct NetworkContext {
    peer_ip: String,
    client_ip: String,
    client_ip_source: &'static str,
}

pub(crate) fn with_http_logging(router: Router) -> Router {
    router.layer(
        ServiceBuilder::new()
            // Request IDs must be installed before TraceLayer creates its span.
            .set_x_request_id(MakeRequestUuid)
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(make_request_span)
                    .on_request(on_request)
                    .on_response(on_response)
                    .on_failure(on_failure),
            )
            .layer(middleware::from_fn(track_active_request))
            .propagate_x_request_id(),
    )
}

async fn track_active_request(request: Request<Body>, next: Next) -> Response<Body> {
    let active_requests = ACTIVE_REQUESTS.fetch_add(1, Ordering::Relaxed) + 1;
    let _guard = ActiveRequestGuard;
    Span::current().record("active_requests_at_start", active_requests);
    next.run(request).await
}

fn make_request_span(request: &Request<Body>) -> Span {
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .and_then(|request_id| request_id.header_value().to_str().ok())
        .unwrap_or("unknown");
    let network = network_context(request);
    let fly_region = request
        .headers()
        .get(FLY_REGION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown");
    let user_agent = request
        .headers()
        .get(USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown");
    let request_bytes = request.body().size_hint().exact();

    tracing::info_span!(
        target: "tursod::http",
        "http_request",
        request_id,
        method = %request.method(),
        path = request.uri().path(),
        route = field::Empty,
        http_version = ?request.version(),
        request_bytes = request_bytes.unwrap_or(0),
        request_size_known = request_bytes.is_some(),
        peer_ip = network.peer_ip,
        client_ip = network.client_ip,
        client_ip_source = network.client_ip_source,
        fly_region,
        user_agent,
        status = field::Empty,
        latency_ms = field::Empty,
        response_bytes = field::Empty,
        response_size_known = field::Empty,
        active_requests_at_start = field::Empty,
        active_requests_remaining = field::Empty,
        auth = field::Empty,
        db_name = field::Empty,
        conn_id = field::Empty,
        statement_count = field::Empty,
        database_reused = field::Empty,
        connection_reused = field::Empty,
        database_open_ms = field::Empty,
        connection_open_ms = field::Empty,
        error_code = field::Empty,
        error_stage = field::Empty,
    )
}

fn network_context<B>(request: &Request<B>) -> NetworkContext {
    let peer_ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(address)| address.ip().to_string())
        .unwrap_or_else(|| "unknown".to_owned());
    let fly_client_ip = request
        .headers()
        .get(FLY_CLIENT_IP)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<IpAddr>().ok());
    let (client_ip, client_ip_source) = match fly_client_ip {
        Some(client_ip) => (client_ip.to_string(), "fly-client-ip"),
        None => (peer_ip.clone(), "peer"),
    };

    NetworkContext {
        peer_ip,
        client_ip,
        client_ip_source,
    }
}

fn on_request(_request: &Request<Body>, span: &Span) {
    span.in_scope(|| tracing::info!(target: "tursod::http", "request started"));
}

fn on_response<B: HttpBody>(response: &Response<B>, latency: Duration, span: &Span) {
    let latency_ms = latency.as_millis() as u64;
    let response_bytes = response.body().size_hint().exact();
    let active_requests_remaining = ACTIVE_REQUESTS.load(Ordering::Relaxed);
    span.record("status", tracing::field::display(response.status()));
    span.record("latency_ms", latency_ms);
    span.record("response_bytes", response_bytes.unwrap_or(0));
    span.record("response_size_known", response_bytes.is_some());
    span.record("active_requests_remaining", active_requests_remaining);
    span.in_scope(|| {
        tracing::info!(
            target: "tursod::http",
            status = %response.status(),
            latency_ms,
            response_bytes = response_bytes.unwrap_or(0),
            response_size_known = response_bytes.is_some(),
            active_requests_remaining,
            "request completed"
        );
    });
}

fn on_failure(error: ServerErrorsFailureClass, latency: Duration, span: &Span) {
    let latency_ms = latency.as_millis() as u64;
    let active_requests_remaining = ACTIVE_REQUESTS.load(Ordering::Relaxed);
    span.record("latency_ms", latency_ms);
    span.record("active_requests_remaining", active_requests_remaining);
    span.in_scope(|| {
        tracing::error!(
            target: "tursod::http",
            error = %error,
            latency_ms,
            active_requests_remaining,
            "request failed"
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;
    use pretty_assertions::assert_eq;

    #[test]
    fn valid_fly_client_ip_takes_precedence_over_peer_ip() {
        let peer = SocketAddr::from(([127, 0, 0, 1], 1234));
        let mut request = Request::new(Body::empty());
        request.extensions_mut().insert(ConnectInfo(peer));
        request
            .headers_mut()
            .insert(FLY_CLIENT_IP, HeaderValue::from_static("203.0.113.7"));

        assert_eq!(
            network_context(&request),
            NetworkContext {
                peer_ip: "127.0.0.1".to_owned(),
                client_ip: "203.0.113.7".to_owned(),
                client_ip_source: "fly-client-ip",
            }
        );
    }

    #[test]
    fn invalid_fly_client_ip_falls_back_to_peer_ip() {
        let peer = SocketAddr::from(([127, 0, 0, 1], 1234));
        let mut request = Request::new(Body::empty());
        request.extensions_mut().insert(ConnectInfo(peer));
        request
            .headers_mut()
            .insert(FLY_CLIENT_IP, HeaderValue::from_static("not-an-ip"));

        assert_eq!(
            network_context(&request),
            NetworkContext {
                peer_ip: "127.0.0.1".to_owned(),
                client_ip: "127.0.0.1".to_owned(),
                client_ip_source: "peer",
            }
        );
    }
}
