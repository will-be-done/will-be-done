import { Schema } from "effect";

export class ResourceNotFoundError extends Schema.TaggedError<ResourceNotFoundError>()(
  "ResourceNotFoundError",
  { resource: Schema.String },
) {
  override get message() {
    return `${this.resource} not found`;
  }
}

export class BadRequestError extends Schema.TaggedError<BadRequestError>()(
  "BadRequestError",
  { message: Schema.String },
) {}

export class ConflictError extends Schema.TaggedError<ConflictError>()(
  "ConflictError",
  { message: Schema.String },
) {}

export class DatabaseAccessDeniedError extends Schema.TaggedError<DatabaseAccessDeniedError>()(
  "DatabaseAccessDeniedError",
  { databaseType: Schema.Literals(["user", "space"]) },
) {
  override get message() {
    return `Access denied to ${this.databaseType}`;
  }
}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {},
) {
  override get message() {
    return "A valid bearer token is required";
  }
}

export type ServiceError =
  | UnauthorizedError
  | ResourceNotFoundError
  | BadRequestError
  | ConflictError
  | DatabaseAccessDeniedError;
