import { Effect, Predicate } from "effect";
import { CliError } from "effect/cli";
import { HttpClientError } from "effect/http";

export const userError = (message: string, cause: unknown = message) =>
  new CliError.UserError({ cause, userMessage: message });

export const fail = (message: string) => Effect.fail(userError(message));

const describe = (error: unknown): string => {
  if (
    Predicate.hasProperty(error, "response") &&
    Predicate.hasProperty(error.response, "status") &&
    Predicate.hasProperty(error, "cause")
  ) {
    if (error.response.status === 401) {
      return "Not authenticated. Run `wbd auth login`.";
    }
    if (
      Predicate.hasProperty(error.cause, "message") &&
      typeof error.cause.message === "string"
    ) {
      return error.cause.message;
    }
    return `Request failed with status ${String(error.response.status)}`;
  }
  if (HttpClientError.isHttpClientError(error)) {
    if (error.reason._tag === "TransportError") {
      return `Could not reach ${error.reason.request.url}`;
    }
    if (error.reason._tag === "StatusCodeError") {
      return `Request failed with status ${error.reason.response.status}`;
    }
  }
  if (Predicate.isTagged(error, "SchemaError")) {
    return "Unexpected response from the server";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
};

export const toUserError = (error: unknown) =>
  error instanceof CliError.UserError
    ? error
    : userError(describe(error), error);
