import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SchemaError } from "effect/Schema";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
// schemas
export type ListSpaces200 = {
  readonly spaces: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
};
export const ListSpaces200 = Schema.Struct({
  spaces: Schema.Array(
    Schema.Struct({
      id: Schema.String.annotate({ description: "Space identifier" }),
      name: Schema.String,
      createdAt: Schema.String.annotate({
        description: "Creation time in ISO 8601 format",
        format: "date-time",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
        }),
      ),
      updatedAt: Schema.String.annotate({
        description: "Update time in ISO 8601 format",
        format: "date-time",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
        }),
      ),
    }),
  ),
}).annotate({ description: "Spaces belonging to the authenticated user" });
export type ListSpaces401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSpaces401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSpaces500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSpaces500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSpaceRequestJson = { readonly name: string } & {
  readonly [x: string]: Schema.Json;
};
export const CreateSpaceRequestJson = Schema.StructWithRest(
  Schema.Struct({
    name: Schema.String.annotate({ description: "Space name" }).check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  }),
  [
    Schema.Record(
      Schema.String,
      Schema.Json.annotate({ expected: "JSON value" }),
    ),
  ],
);
export type CreateSpace201 = {
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
};
export const CreateSpace201 = Schema.Struct({
  space: Schema.Struct({
    id: Schema.String.annotate({ description: "Space identifier" }),
    name: Schema.String,
    createdAt: Schema.String.annotate({
      description: "Creation time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
    updatedAt: Schema.String.annotate({
      description: "Update time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
  }),
});
export type CreateSpace400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSpace400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSpace401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSpace401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSpace500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSpace500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetSpace200 = {
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
};
export const GetSpace200 = Schema.Struct({
  space: Schema.Struct({
    id: Schema.String.annotate({ description: "Space identifier" }),
    name: Schema.String,
    createdAt: Schema.String.annotate({
      description: "Creation time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
    updatedAt: Schema.String.annotate({
      description: "Update time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
  }),
}).annotate({ description: "Space details" });
export type GetSpace400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetSpace400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetSpace401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetSpace401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetSpace403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetSpace403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetSpace404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetSpace404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetSpace500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetSpace500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteSpace400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteSpace400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteSpace401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteSpace401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteSpace404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteSpace404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteSpace500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteSpace500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateSpaceRequestJson = { readonly name?: string };
export const UpdateSpaceRequestJson = Schema.Struct({
  name: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
});
export type UpdateSpace200 = {
  readonly space: {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
};
export const UpdateSpace200 = Schema.Struct({
  space: Schema.Struct({
    id: Schema.String.annotate({ description: "Space identifier" }),
    name: Schema.String,
    createdAt: Schema.String.annotate({
      description: "Creation time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
    updatedAt: Schema.String.annotate({
      description: "Update time in ISO 8601 format",
      format: "date-time",
    }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$",
      }),
    ),
  }),
}).annotate({ description: "Space details" });
export type UpdateSpace400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateSpace400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateSpace401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateSpace401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateSpace404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateSpace404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateSpace500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateSpace500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjects200 = {
  readonly projects: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    readonly isInbox: boolean;
    readonly createdAt: number;
  }>;
};
export const ListProjects200 = Schema.Struct({
  projects: Schema.Array(
    Schema.Struct({
      id: Schema.String.annotate({ description: "Project identifier" }),
      title: Schema.String,
      icon: Schema.String,
      isInbox: Schema.Boolean,
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
    }),
  ),
}).annotate({ description: "Projects in display order" });
export type ListProjects400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjects400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjects401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjects401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjects403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjects403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjects404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjects404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjects500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjects500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectRequestJson = {
  readonly title: string;
  readonly icon?: string;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateProjectRequestJson = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  icon: Schema.optionalKey(Schema.String),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateProject201 = {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    readonly isInbox: boolean;
    readonly createdAt: number;
  };
};
export const CreateProject201 = Schema.Struct({
  project: Schema.Struct({
    id: Schema.String.annotate({ description: "Project identifier" }),
    title: Schema.String,
    icon: Schema.String,
    isInbox: Schema.Boolean,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project details" });
export type CreateProject400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProject400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProject401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProject401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProject403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProject403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProject409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProject409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProject500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProject500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProject200 = {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    readonly isInbox: boolean;
    readonly createdAt: number;
  };
};
export const GetProject200 = Schema.Struct({
  project: Schema.Struct({
    id: Schema.String.annotate({ description: "Project identifier" }),
    title: Schema.String,
    icon: Schema.String,
    isInbox: Schema.Boolean,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project details" });
export type GetProject400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProject400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProject401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProject401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProject403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProject403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProject404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProject404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProject500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProject500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProject500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProject500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectRequestJson = {
  readonly title?: string;
  readonly icon?: string;
};
export const UpdateProjectRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  icon: Schema.optionalKey(Schema.String),
});
export type UpdateProject200 = {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    readonly isInbox: boolean;
    readonly createdAt: number;
  };
};
export const UpdateProject200 = Schema.Struct({
  project: Schema.Struct({
    id: Schema.String.annotate({ description: "Project identifier" }),
    title: Schema.String,
    icon: Schema.String,
    isInbox: Schema.Boolean,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project details" });
export type UpdateProject400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProject401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProject403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProject404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProject409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProject500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProject500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectRequestJson = {
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveProjectRequestJson = Schema.Struct({
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveProject200 = {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    readonly isInbox: boolean;
    readonly createdAt: number;
  };
};
export const MoveProject200 = Schema.Struct({
  project: Schema.Struct({
    id: Schema.String.annotate({ description: "Project identifier" }),
    title: Schema.String,
    icon: Schema.String,
    isInbox: Schema.Boolean,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project details" });
export type MoveProject400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProject401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProject403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProject404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProject409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProject500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProject500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjectSections200 = {
  readonly sections: ReadonlyArray<{
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly createdAt: number;
  }>;
};
export const ListProjectSections200 = Schema.Struct({
  sections: Schema.Array(
    Schema.Struct({
      id: Schema.String.annotate({ description: "Project section identifier" }),
      projectId: Schema.String.annotate({
        description: "Parent project identifier",
      }),
      title: Schema.String,
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
    }),
  ),
});
export type ListProjectSections400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjectSections400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjectSections401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjectSections401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjectSections403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjectSections403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjectSections404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjectSections404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListProjectSections500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListProjectSections500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSectionRequestJson = {
  readonly title: string;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateProjectSectionRequestJson = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateProjectSection201 = {
  readonly section: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly createdAt: number;
  };
};
export const CreateProjectSection201 = Schema.Struct({
  section: Schema.Struct({
    id: Schema.String.annotate({ description: "Project section identifier" }),
    projectId: Schema.String.annotate({
      description: "Parent project identifier",
    }),
    title: Schema.String,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project section details" });
export type CreateProjectSection400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSection401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSection403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSection404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSection409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateProjectSection500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateProjectSection500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProjectSection200 = {
  readonly section: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly createdAt: number;
  };
};
export const GetProjectSection200 = Schema.Struct({
  section: Schema.Struct({
    id: Schema.String.annotate({ description: "Project section identifier" }),
    projectId: Schema.String.annotate({
      description: "Parent project identifier",
    }),
    title: Schema.String,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project section details" });
export type GetProjectSection400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProjectSection400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProjectSection401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProjectSection401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProjectSection403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProjectSection403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProjectSection404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProjectSection404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetProjectSection500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetProjectSection500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteProjectSection500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteProjectSection500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSectionRequestJson = { readonly title?: string };
export const UpdateProjectSectionRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
});
export type UpdateProjectSection200 = {
  readonly section: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly createdAt: number;
  };
};
export const UpdateProjectSection200 = Schema.Struct({
  section: Schema.Struct({
    id: Schema.String.annotate({ description: "Project section identifier" }),
    projectId: Schema.String.annotate({
      description: "Parent project identifier",
    }),
    title: Schema.String,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project section details" });
export type UpdateProjectSection400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSection401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSection403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSection404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSection409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateProjectSection500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateProjectSection500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSectionRequestJson = {
  readonly projectId: string;
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveProjectSectionRequestJson = Schema.Struct({
  projectId: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveProjectSection200 = {
  readonly section: {
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
    readonly createdAt: number;
  };
};
export const MoveProjectSection200 = Schema.Struct({
  section: Schema.Struct({
    id: Schema.String.annotate({ description: "Project section identifier" }),
    projectId: Schema.String.annotate({
      description: "Parent project identifier",
    }),
    title: Schema.String,
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
  }),
}).annotate({ description: "Project section details" });
export type MoveProjectSection400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSection401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSection403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSection404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSection409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveProjectSection500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveProjectSection500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTasksParams = {
  readonly cursor?: string;
  readonly limit?: number;
};
export const ListTasksParams = Schema.Struct({
  cursor: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  limit: Schema.optionalKey(
    Schema.Number.annotate({ default: 50 })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(1).annotate({
          expected: "a value greater than or equal to 1",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(200).annotate({
          expected: "a value less than or equal to 200",
        }),
      ),
  ),
});
export type ListTasks200 = {
  readonly tasks: ReadonlyArray<{
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  }>;
  readonly nextCursor: string | null;
};
export const ListTasks200 = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("task"),
      id: Schema.String.annotate({ description: "Task identifier" }),
      title: Schema.String,
      content: Schema.optionalKey(Schema.String),
      state: Schema.Literals(["todo", "done"]),
      projectSectionId: Schema.String.annotate({
        description: "Parent project section identifier",
      }),
      nature: Schema.Literals(["red", "green", "unknown"]),
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      lastToggledAt: Schema.Number.annotate({
        description: "Last state change time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      scheduledDate: Schema.Union([
        Schema.String.annotate({ format: "date" }).check(
          Schema.isPattern(
            new globalThis.RegExp(
              "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              "u",
            ),
          ).annotate({
            expected:
              "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Current schedule date, or null when the task is unscheduled",
      }),
      scheduledTime: Schema.Union([
        Schema.String.annotate({
          description:
            "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
        }).check(
          Schema.isPattern(
            new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
          ).annotate({
            expected:
              "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Time on the schedule date in HH:mm, or null when the task has no time",
      }),
      durationMinutes: Schema.Union([
        Schema.Number.annotate({
          description: "Estimated duration in whole minutes",
        })
          .check(Schema.isInt().annotate({ expected: "an integer" }))
          .check(
            Schema.isGreaterThanOrEqualTo(1).annotate({
              expected: "a value greater than or equal to 1",
            }),
          )
          .check(
            Schema.isLessThanOrEqualTo(10080).annotate({
              expected: "a value less than or equal to 10080",
            }),
          ),
        Schema.Null,
      ]),
    }),
  ),
  nextCursor: Schema.Union([Schema.String, Schema.Null]),
}).annotate({
  description: "Page of tasks with an optional continuation cursor",
});
export type ListTasks400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTasks400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTasks401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTasks401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTasks403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTasks403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTasks404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTasks404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTasks500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTasks500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListScheduledTasksParams = {
  readonly scope: "overdue" | "upcoming";
  readonly relativeTo?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly limit?: number;
};
export const ListScheduledTasksParams = Schema.Struct({
  scope: Schema.Literals(["overdue", "upcoming"]),
  relativeTo: Schema.optionalKey(
    Schema.String.annotate({ format: "date" }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
      }),
    ),
  ),
  to: Schema.optionalKey(
    Schema.String.annotate({ format: "date" }).check(
      Schema.isPattern(
        new globalThis.RegExp(
          "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          "u",
        ),
      ).annotate({
        expected:
          "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
      }),
    ),
  ),
  cursor: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  limit: Schema.optionalKey(
    Schema.Number.annotate({ default: 50 })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(1).annotate({
          expected: "a value greater than or equal to 1",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(200).annotate({
          expected: "a value less than or equal to 200",
        }),
      ),
  ),
});
export type ListScheduledTasks200 = {
  readonly tasks: ReadonlyArray<{
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  }>;
  readonly nextCursor: string | null;
};
export const ListScheduledTasks200 = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("task"),
      id: Schema.String.annotate({ description: "Task identifier" }),
      title: Schema.String,
      content: Schema.optionalKey(Schema.String),
      state: Schema.Literals(["todo", "done"]),
      projectSectionId: Schema.String.annotate({
        description: "Parent project section identifier",
      }),
      nature: Schema.Literals(["red", "green", "unknown"]),
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      lastToggledAt: Schema.Number.annotate({
        description: "Last state change time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      scheduledDate: Schema.Union([
        Schema.String.annotate({ format: "date" }).check(
          Schema.isPattern(
            new globalThis.RegExp(
              "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              "u",
            ),
          ).annotate({
            expected:
              "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Current schedule date, or null when the task is unscheduled",
      }),
      scheduledTime: Schema.Union([
        Schema.String.annotate({
          description:
            "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
        }).check(
          Schema.isPattern(
            new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
          ).annotate({
            expected:
              "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Time on the schedule date in HH:mm, or null when the task has no time",
      }),
      durationMinutes: Schema.Union([
        Schema.Number.annotate({
          description: "Estimated duration in whole minutes",
        })
          .check(Schema.isInt().annotate({ expected: "an integer" }))
          .check(
            Schema.isGreaterThanOrEqualTo(1).annotate({
              expected: "a value greater than or equal to 1",
            }),
          )
          .check(
            Schema.isLessThanOrEqualTo(10080).annotate({
              expected: "a value less than or equal to 10080",
            }),
          ),
        Schema.Null,
      ]),
    }),
  ),
  nextCursor: Schema.Union([Schema.String, Schema.Null]),
}).annotate({
  description: "Page of tasks with an optional continuation cursor",
});
export type ListScheduledTasks400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListScheduledTasks400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListScheduledTasks401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListScheduledTasks401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListScheduledTasks403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListScheduledTasks403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListScheduledTasks404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListScheduledTasks404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListScheduledTasks500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListScheduledTasks500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSectionItemsParams = { readonly taskState?: "todo" | "done" };
export const ListSectionItemsParams = Schema.Struct({
  taskState: Schema.optionalKey(
    Schema.Literals(["todo", "done"]).annotate({ default: "todo" }),
  ),
});
export type ListSectionItems200 = {
  readonly items: ReadonlyArray<
    | {
        readonly type: "task";
        readonly id: string;
        readonly title: string;
        readonly content?: string;
        readonly state: "todo" | "done";
        readonly projectSectionId: string;
        readonly nature: "red" | "green" | "unknown";
        readonly createdAt: number;
        readonly lastToggledAt: number;
        readonly scheduledDate: string | null;
        readonly scheduledTime: string | null;
        readonly durationMinutes: number | null;
      }
    | {
        readonly type: "template";
        readonly id: string;
        readonly title: string;
        readonly content?: string;
        readonly projectSectionId: string;
        readonly nature: "red" | "green" | "unknown";
        readonly repeatRule: string;
        readonly repeatRuleDtStart: number;
        readonly time: string | null;
        readonly durationMinutes: number | null;
        readonly createdAt: number;
        readonly lastGeneratedAt: number;
      }
    | {
        readonly type: "note";
        readonly id: string;
        readonly title: string;
        readonly content?: string;
        readonly projectSectionId: string;
        readonly createdAt: number;
      }
  >;
};
export const ListSectionItems200 = Schema.Struct({
  items: Schema.Array(
    Schema.Union(
      [
        Schema.Struct({
          type: Schema.Literal("task"),
          id: Schema.String.annotate({ description: "Task identifier" }),
          title: Schema.String,
          content: Schema.optionalKey(Schema.String),
          state: Schema.Literals(["todo", "done"]),
          projectSectionId: Schema.String.annotate({
            description: "Parent project section identifier",
          }),
          nature: Schema.Literals(["red", "green", "unknown"]),
          createdAt: Schema.Number.annotate({
            description: "Creation time as Unix milliseconds",
          })
            .check(Schema.isInt().annotate({ expected: "an integer" }))
            .check(
              Schema.isGreaterThanOrEqualTo(0).annotate({
                expected: "a value greater than or equal to 0",
              }),
            )
            .check(
              Schema.isLessThanOrEqualTo(9007199254740991).annotate({
                expected: "a value less than or equal to 9007199254740991",
              }),
            ),
          lastToggledAt: Schema.Number.annotate({
            description: "Last state change time as Unix milliseconds",
          })
            .check(Schema.isInt().annotate({ expected: "an integer" }))
            .check(
              Schema.isGreaterThanOrEqualTo(0).annotate({
                expected: "a value greater than or equal to 0",
              }),
            )
            .check(
              Schema.isLessThanOrEqualTo(9007199254740991).annotate({
                expected: "a value less than or equal to 9007199254740991",
              }),
            ),
          scheduledDate: Schema.Union([
            Schema.String.annotate({ format: "date" }).check(
              Schema.isPattern(
                new globalThis.RegExp(
                  "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
                  "u",
                ),
              ).annotate({
                expected:
                  "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              }),
            ),
            Schema.Null,
          ]).annotate({
            description:
              "Current schedule date, or null when the task is unscheduled",
          }),
          scheduledTime: Schema.Union([
            Schema.String.annotate({
              description:
                "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
            }).check(
              Schema.isPattern(
                new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
              ).annotate({
                expected:
                  "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
              }),
            ),
            Schema.Null,
          ]).annotate({
            description:
              "Time on the schedule date in HH:mm, or null when the task has no time",
          }),
          durationMinutes: Schema.Union([
            Schema.Number.annotate({
              description: "Estimated duration in whole minutes",
            })
              .check(Schema.isInt().annotate({ expected: "an integer" }))
              .check(
                Schema.isGreaterThanOrEqualTo(1).annotate({
                  expected: "a value greater than or equal to 1",
                }),
              )
              .check(
                Schema.isLessThanOrEqualTo(10080).annotate({
                  expected: "a value less than or equal to 10080",
                }),
              ),
            Schema.Null,
          ]),
        }),
        Schema.Struct({
          type: Schema.Literal("template"),
          id: Schema.String.annotate({
            description: "Task template identifier",
          }),
          title: Schema.String,
          content: Schema.optionalKey(Schema.String),
          projectSectionId: Schema.String.annotate({
            description: "Parent project section identifier",
          }),
          nature: Schema.Literals(["red", "green", "unknown"]),
          repeatRule: Schema.String,
          repeatRuleDtStart: Schema.Int.check(
            Schema.isGreaterThanOrEqualTo(0).annotate({
              expected: "a value greater than or equal to 0",
            }),
          ).check(
            Schema.isLessThanOrEqualTo(9007199254740991).annotate({
              expected: "a value less than or equal to 9007199254740991",
            }),
          ),
          time: Schema.Union([
            Schema.String.annotate({
              description:
                "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
            }).check(
              Schema.isPattern(
                new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
              ).annotate({
                expected:
                  "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
              }),
            ),
            Schema.Null,
          ]).annotate({
            description:
              "Time given to generated tasks for daily or coarser rules",
          }),
          durationMinutes: Schema.Union([
            Schema.Number.annotate({
              description: "Estimated duration in whole minutes",
            })
              .check(Schema.isInt().annotate({ expected: "an integer" }))
              .check(
                Schema.isGreaterThanOrEqualTo(1).annotate({
                  expected: "a value greater than or equal to 1",
                }),
              )
              .check(
                Schema.isLessThanOrEqualTo(10080).annotate({
                  expected: "a value less than or equal to 10080",
                }),
              ),
            Schema.Null,
          ]),
          createdAt: Schema.Int.check(
            Schema.isGreaterThanOrEqualTo(0).annotate({
              expected: "a value greater than or equal to 0",
            }),
          ).check(
            Schema.isLessThanOrEqualTo(9007199254740991).annotate({
              expected: "a value less than or equal to 9007199254740991",
            }),
          ),
          lastGeneratedAt: Schema.Int.check(
            Schema.isGreaterThanOrEqualTo(0).annotate({
              expected: "a value greater than or equal to 0",
            }),
          ).check(
            Schema.isLessThanOrEqualTo(9007199254740991).annotate({
              expected: "a value less than or equal to 9007199254740991",
            }),
          ),
        }),
        Schema.Struct({
          type: Schema.Literal("note"),
          id: Schema.String.annotate({ description: "Note identifier" }),
          title: Schema.String,
          content: Schema.optionalKey(Schema.String),
          projectSectionId: Schema.String.annotate({
            description: "Parent project section identifier",
          }),
          createdAt: Schema.Int.check(
            Schema.isGreaterThanOrEqualTo(0).annotate({
              expected: "a value greater than or equal to 0",
            }),
          ).check(
            Schema.isLessThanOrEqualTo(9007199254740991).annotate({
              expected: "a value less than or equal to 9007199254740991",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ),
  ),
});
export type ListSectionItems400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSectionItems400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSectionItems401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSectionItems401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSectionItems403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSectionItems403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSectionItems404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSectionItems404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListSectionItems500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListSectionItems500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTaskRequestJson = {
  readonly title: string;
  readonly content?: string;
  readonly nature?: "red" | "green" | "unknown";
  readonly durationMinutes?: number;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateSectionTaskRequestJson = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  content: Schema.optionalKey(Schema.String),
  nature: Schema.optionalKey(Schema.Literals(["red", "green", "unknown"])),
  durationMinutes: Schema.optionalKey(
    Schema.Number.annotate({
      description: "Estimated duration in whole minutes",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(1).annotate({
          expected: "a value greater than or equal to 1",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(10080).annotate({
          expected: "a value less than or equal to 10080",
        }),
      ),
  ),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateSectionTask201 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const CreateSectionTask201 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type CreateSectionTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTask409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateSectionTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateSectionTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const GetTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type GetTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskRequestJson = {
  readonly title?: string;
  readonly content?: string | null;
  readonly state?: "todo" | "done";
  readonly nature?: "red" | "green" | "unknown" | null;
  readonly scheduledTime?: string | null;
  readonly durationMinutes?: number | null;
};
export const UpdateTaskRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  content: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  state: Schema.optionalKey(Schema.Literals(["todo", "done"])),
  nature: Schema.optionalKey(
    Schema.Union([Schema.Literals(["red", "green", "unknown"]), Schema.Null]),
  ),
  scheduledTime: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the current schedule date; the task must be scheduled",
    }),
  ),
  durationMinutes: Schema.optionalKey(
    Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  ),
});
export type UpdateTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const UpdateTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type UpdateTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTask409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTaskRequestJson = {
  readonly date: string;
  readonly time?: string | null;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const ScheduleTaskRequestJson = Schema.Struct({
  date: Schema.String.annotate({
    description: "Schedule date in YYYY-MM-DD format",
    format: "date",
  }).check(
    Schema.isPattern(
      new globalThis.RegExp(
        "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        "u",
      ),
    ).annotate({
      expected:
        "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
    }),
  ),
  time: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the date; omit to keep the current time, null to clear",
    }),
  ),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type ScheduleTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
  readonly date: string;
};
export const ScheduleTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
  date: Schema.String.annotate({ format: "date" }).check(
    Schema.isPattern(
      new globalThis.RegExp(
        "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        "u",
      ),
    ).annotate({
      expected:
        "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
    }),
  ),
});
export type ScheduleTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTask409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ScheduleTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ScheduleTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ClearTaskSchedule400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ClearTaskSchedule400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ClearTaskSchedule401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ClearTaskSchedule401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ClearTaskSchedule403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ClearTaskSchedule403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ClearTaskSchedule404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ClearTaskSchedule404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ClearTaskSchedule500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ClearTaskSchedule500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskRequestJson = {
  readonly projectSectionId: string;
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveTaskRequestJson = Schema.Struct({
  projectSectionId: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const MoveTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type MoveTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTask409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListsParams = {
  readonly from: string;
  readonly to: string;
  readonly state?: "todo" | "done";
  readonly cursor?: string;
  readonly limit?: number;
};
export const ListDailyListsParams = Schema.Struct({
  from: Schema.String.annotate({ format: "date" }).check(
    Schema.isPattern(
      new globalThis.RegExp(
        "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        "u",
      ),
    ).annotate({
      expected:
        "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
    }),
  ),
  to: Schema.String.annotate({ format: "date" }).check(
    Schema.isPattern(
      new globalThis.RegExp(
        "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        "u",
      ),
    ).annotate({
      expected:
        "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
    }),
  ),
  state: Schema.optionalKey(
    Schema.Literals(["todo", "done"]).annotate({ default: "todo" }),
  ),
  cursor: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  limit: Schema.optionalKey(
    Schema.Number.annotate({ default: 50 })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(1).annotate({
          expected: "a value greater than or equal to 1",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(200).annotate({
          expected: "a value less than or equal to 200",
        }),
      ),
  ),
});
export type ListDailyLists200 = {
  readonly dailyLists: ReadonlyArray<{
    readonly date: string;
    readonly items: ReadonlyArray<{
      readonly type: "task";
      readonly id: string;
      readonly title: string;
      readonly content?: string;
      readonly state: "todo" | "done";
      readonly projectSectionId: string;
      readonly nature: "red" | "green" | "unknown";
      readonly createdAt: number;
      readonly lastToggledAt: number;
      readonly scheduledDate: string | null;
      readonly scheduledTime: string | null;
      readonly durationMinutes: number | null;
    }>;
  }>;
  readonly nextCursor: string | null;
};
export const ListDailyLists200 = Schema.Struct({
  dailyLists: Schema.Array(
    Schema.Struct({
      date: Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      items: Schema.Array(
        Schema.Struct({
          type: Schema.Literal("task"),
          id: Schema.String.annotate({ description: "Task identifier" }),
          title: Schema.String,
          content: Schema.optionalKey(Schema.String),
          state: Schema.Literals(["todo", "done"]),
          projectSectionId: Schema.String.annotate({
            description: "Parent project section identifier",
          }),
          nature: Schema.Literals(["red", "green", "unknown"]),
          createdAt: Schema.Number.annotate({
            description: "Creation time as Unix milliseconds",
          })
            .check(Schema.isInt().annotate({ expected: "an integer" }))
            .check(
              Schema.isGreaterThanOrEqualTo(0).annotate({
                expected: "a value greater than or equal to 0",
              }),
            )
            .check(
              Schema.isLessThanOrEqualTo(9007199254740991).annotate({
                expected: "a value less than or equal to 9007199254740991",
              }),
            ),
          lastToggledAt: Schema.Number.annotate({
            description: "Last state change time as Unix milliseconds",
          })
            .check(Schema.isInt().annotate({ expected: "an integer" }))
            .check(
              Schema.isGreaterThanOrEqualTo(0).annotate({
                expected: "a value greater than or equal to 0",
              }),
            )
            .check(
              Schema.isLessThanOrEqualTo(9007199254740991).annotate({
                expected: "a value less than or equal to 9007199254740991",
              }),
            ),
          scheduledDate: Schema.Union([
            Schema.String.annotate({ format: "date" }).check(
              Schema.isPattern(
                new globalThis.RegExp(
                  "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
                  "u",
                ),
              ).annotate({
                expected:
                  "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              }),
            ),
            Schema.Null,
          ]).annotate({
            description:
              "Current schedule date, or null when the task is unscheduled",
          }),
          scheduledTime: Schema.Union([
            Schema.String.annotate({
              description:
                "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
            }).check(
              Schema.isPattern(
                new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
              ).annotate({
                expected:
                  "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
              }),
            ),
            Schema.Null,
          ]).annotate({
            description:
              "Time on the schedule date in HH:mm, or null when the task has no time",
          }),
          durationMinutes: Schema.Union([
            Schema.Number.annotate({
              description: "Estimated duration in whole minutes",
            })
              .check(Schema.isInt().annotate({ expected: "an integer" }))
              .check(
                Schema.isGreaterThanOrEqualTo(1).annotate({
                  expected: "a value greater than or equal to 1",
                }),
              )
              .check(
                Schema.isLessThanOrEqualTo(10080).annotate({
                  expected: "a value less than or equal to 10080",
                }),
              ),
            Schema.Null,
          ]),
        }),
      ),
    }),
  ),
  nextCursor: Schema.Union([Schema.String, Schema.Null]),
}).annotate({
  description:
    "Page of daily lists in ascending date order with an optional continuation cursor",
});
export type ListDailyLists400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyLists400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyLists401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyLists401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyLists403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyLists403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyLists404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyLists404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyLists500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyLists500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListItemsParams = { readonly state?: "todo" | "done" };
export const ListDailyListItemsParams = Schema.Struct({
  state: Schema.optionalKey(
    Schema.Literals(["todo", "done"]).annotate({ default: "todo" }),
  ),
});
export type ListDailyListItems200 = {
  readonly items: ReadonlyArray<{
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  }>;
};
export const ListDailyListItems200 = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("task"),
      id: Schema.String.annotate({ description: "Task identifier" }),
      title: Schema.String,
      content: Schema.optionalKey(Schema.String),
      state: Schema.Literals(["todo", "done"]),
      projectSectionId: Schema.String.annotate({
        description: "Parent project section identifier",
      }),
      nature: Schema.Literals(["red", "green", "unknown"]),
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      lastToggledAt: Schema.Number.annotate({
        description: "Last state change time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      scheduledDate: Schema.Union([
        Schema.String.annotate({ format: "date" }).check(
          Schema.isPattern(
            new globalThis.RegExp(
              "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              "u",
            ),
          ).annotate({
            expected:
              "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Current schedule date, or null when the task is unscheduled",
      }),
      scheduledTime: Schema.Union([
        Schema.String.annotate({
          description:
            "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
        }).check(
          Schema.isPattern(
            new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
          ).annotate({
            expected:
              "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Time on the schedule date in HH:mm, or null when the task has no time",
      }),
      durationMinutes: Schema.Union([
        Schema.Number.annotate({
          description: "Estimated duration in whole minutes",
        })
          .check(Schema.isInt().annotate({ expected: "an integer" }))
          .check(
            Schema.isGreaterThanOrEqualTo(1).annotate({
              expected: "a value greater than or equal to 1",
            }),
          )
          .check(
            Schema.isLessThanOrEqualTo(10080).annotate({
              expected: "a value less than or equal to 10080",
            }),
          ),
        Schema.Null,
      ]),
    }),
  ),
});
export type ListDailyListItems400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyListItems400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListItems401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyListItems401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListItems403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyListItems403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListItems404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyListItems404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListDailyListItems500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListDailyListItems500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateRequestJson = {
  readonly title: string;
  readonly content?: string | null;
  readonly nature?: "red" | "green" | "unknown" | null;
  readonly repeatRule?: string;
  readonly repeatRuleDtStart?: number;
  readonly time?: string | null;
  readonly durationMinutes?: number | null;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateTaskTemplateRequestJson = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  content: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  nature: Schema.optionalKey(
    Schema.Union([Schema.Literals(["red", "green", "unknown"]), Schema.Null]),
  ),
  repeatRule: Schema.optionalKey(
    Schema.String.annotate({ description: "RFC 5545 recurrence rule" }).check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  repeatRuleDtStart: Schema.optionalKey(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  ),
  time: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]),
  ),
  durationMinutes: Schema.optionalKey(
    Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  ),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateTaskTemplate201 = {
  readonly template: {
    readonly type: "template";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly repeatRule: string;
    readonly repeatRuleDtStart: number;
    readonly time: string | null;
    readonly durationMinutes: number | null;
    readonly createdAt: number;
    readonly lastGeneratedAt: number;
  };
};
export const CreateTaskTemplate201 = Schema.Struct({
  template: Schema.Struct({
    type: Schema.Literal("template"),
    id: Schema.String.annotate({ description: "Task template identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    repeatRule: Schema.String,
    repeatRuleDtStart: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    time: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description: "Time given to generated tasks for daily or coarser rules",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    lastGeneratedAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type CreateTaskTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplate409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTaskTemplate200 = {
  readonly template: {
    readonly type: "template";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly repeatRule: string;
    readonly repeatRuleDtStart: number;
    readonly time: string | null;
    readonly durationMinutes: number | null;
    readonly createdAt: number;
    readonly lastGeneratedAt: number;
  };
};
export const GetTaskTemplate200 = Schema.Struct({
  template: Schema.Struct({
    type: Schema.Literal("template"),
    id: Schema.String.annotate({ description: "Task template identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    repeatRule: Schema.String,
    repeatRuleDtStart: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    time: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description: "Time given to generated tasks for daily or coarser rules",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    lastGeneratedAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type GetTaskTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTaskTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTaskTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTaskTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTaskTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTaskTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTaskTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTaskTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetTaskTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetTaskTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTaskTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTaskTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTaskTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTaskTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTaskTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTaskTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTaskTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTaskTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteTaskTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteTaskTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskTemplateRequestJson = {
  readonly title?: string;
  readonly content?: string | null;
  readonly nature?: "red" | "green" | "unknown" | null;
  readonly repeatRule?: string;
  readonly repeatRuleDtStart?: number;
  readonly time?: string | null;
  readonly durationMinutes?: number | null;
};
export const UpdateTaskTemplateRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  content: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  nature: Schema.optionalKey(
    Schema.Union([Schema.Literals(["red", "green", "unknown"]), Schema.Null]),
  ),
  repeatRule: Schema.optionalKey(
    Schema.String.annotate({ description: "RFC 5545 recurrence rule" }).check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  repeatRuleDtStart: Schema.optionalKey(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  ),
  time: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]),
  ),
  durationMinutes: Schema.optionalKey(
    Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  ),
});
export type UpdateTaskTemplate200 = {
  readonly template: {
    readonly type: "template";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly repeatRule: string;
    readonly repeatRuleDtStart: number;
    readonly time: string | null;
    readonly durationMinutes: number | null;
    readonly createdAt: number;
    readonly lastGeneratedAt: number;
  };
};
export const UpdateTaskTemplate200 = Schema.Struct({
  template: Schema.Struct({
    type: Schema.Literal("template"),
    id: Schema.String.annotate({ description: "Task template identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    repeatRule: Schema.String,
    repeatRuleDtStart: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    time: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description: "Time given to generated tasks for daily or coarser rules",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    lastGeneratedAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type UpdateTaskTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTaskTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTaskTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTaskTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTaskTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateTaskTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateTaskTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplateRequestJson = {
  readonly projectSectionId: string;
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveTaskTemplateRequestJson = Schema.Struct({
  projectSectionId: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveTaskTemplate200 = {
  readonly template: {
    readonly type: "template";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly repeatRule: string;
    readonly repeatRuleDtStart: number;
    readonly time: string | null;
    readonly durationMinutes: number | null;
    readonly createdAt: number;
    readonly lastGeneratedAt: number;
  };
};
export const MoveTaskTemplate200 = Schema.Struct({
  template: Schema.Struct({
    type: Schema.Literal("template"),
    id: Schema.String.annotate({ description: "Task template identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    repeatRule: Schema.String,
    repeatRuleDtStart: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    time: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description: "Time given to generated tasks for daily or coarser rules",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    lastGeneratedAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type MoveTaskTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplate409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveTaskTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveTaskTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToTemplateRequestJson = {
  readonly title?: string;
  readonly content?: string | null;
  readonly nature?: "red" | "green" | "unknown" | null;
  readonly repeatRule?: string;
  readonly repeatRuleDtStart?: number;
  readonly time?: string | null;
  readonly durationMinutes?: number | null;
};
export const ConvertTaskToTemplateRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  content: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  nature: Schema.optionalKey(
    Schema.Union([Schema.Literals(["red", "green", "unknown"]), Schema.Null]),
  ),
  repeatRule: Schema.optionalKey(
    Schema.String.annotate({ description: "RFC 5545 recurrence rule" }).check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  repeatRuleDtStart: Schema.optionalKey(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  ),
  time: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]),
  ),
  durationMinutes: Schema.optionalKey(
    Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  ),
});
export type ConvertTaskToTemplate200 = {
  readonly template: {
    readonly type: "template";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly repeatRule: string;
    readonly repeatRuleDtStart: number;
    readonly time: string | null;
    readonly durationMinutes: number | null;
    readonly createdAt: number;
    readonly lastGeneratedAt: number;
  };
};
export const ConvertTaskToTemplate200 = Schema.Struct({
  template: Schema.Struct({
    type: Schema.Literal("template"),
    id: Schema.String.annotate({ description: "Task template identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    repeatRule: Schema.String,
    repeatRuleDtStart: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    time: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description: "Time given to generated tasks for daily or coarser rules",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    lastGeneratedAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type ConvertTaskToTemplate400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToTemplate400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToTemplate401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToTemplate401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToTemplate403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToTemplate403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToTemplate404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToTemplate404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToTemplate500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToTemplate500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskTemplateToTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const ConvertTaskTemplateToTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type ConvertTaskTemplateToTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskTemplateToTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskTemplateToTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskTemplateToTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskTemplateToTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskTemplateToTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskTemplateToTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskTemplateToTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskTemplateToTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskTemplateToTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetNote200 = {
  readonly note: {
    readonly type: "note";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly createdAt: number;
  };
};
export const GetNote200 = Schema.Struct({
  note: Schema.Struct({
    type: Schema.Literal("note"),
    id: Schema.String.annotate({ description: "Note identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type GetNote400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetNote400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetNote401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetNote401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetNote403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetNote403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetNote404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetNote404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetNote500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetNote500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteNote400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteNote400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteNote401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteNote401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteNote403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteNote403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteNote404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteNote404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteNote500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteNote500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateNoteRequestJson = {
  readonly title?: string;
  readonly content?: string;
};
export const UpdateNoteRequestJson = Schema.Struct({
  title: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  content: Schema.optionalKey(Schema.String),
});
export type UpdateNote200 = {
  readonly note: {
    readonly type: "note";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly createdAt: number;
  };
};
export const UpdateNote200 = Schema.Struct({
  note: Schema.Struct({
    type: Schema.Literal("note"),
    id: Schema.String.annotate({ description: "Note identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type UpdateNote400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateNote400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateNote401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateNote401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateNote403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateNote403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateNote404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateNote404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateNote500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateNote500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNoteRequestJson = {
  readonly projectSectionId: string;
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveNoteRequestJson = Schema.Struct({
  projectSectionId: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveNote200 = {
  readonly note: {
    readonly type: "note";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly createdAt: number;
  };
};
export const MoveNote200 = Schema.Struct({
  note: Schema.Struct({
    type: Schema.Literal("note"),
    id: Schema.String.annotate({ description: "Note identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type MoveNote400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNote401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNote403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNote404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNote409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveNote500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveNote500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToNote200 = {
  readonly note: {
    readonly type: "note";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly projectSectionId: string;
    readonly createdAt: number;
  };
};
export const ConvertTaskToNote200 = Schema.Struct({
  note: Schema.Struct({
    type: Schema.Literal("note"),
    id: Schema.String.annotate({ description: "Note identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
  }),
});
export type ConvertTaskToNote400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToNote400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToNote401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToNote401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToNote403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToNote403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToNote404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToNote404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertTaskToNote500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertTaskToNote500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertNoteToTask200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const ConvertNoteToTask200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type ConvertNoteToTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertNoteToTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertNoteToTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertNoteToTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertNoteToTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertNoteToTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertNoteToTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertNoteToTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ConvertNoteToTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ConvertNoteToTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskChecklistItems200 = {
  readonly checklistItems: ReadonlyArray<{
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  }>;
};
export const ListTaskChecklistItems200 = Schema.Struct({
  checklistItems: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("checklistItem"),
      id: Schema.String.annotate({ description: "Checklist item identifier" }),
      parentId: Schema.String.annotate({
        description: "Task or task-template identifier",
      }),
      parentType: Schema.Literals(["task", "template"]),
      state: Schema.Literals(["todo", "done"]),
      content: Schema.String,
      createdAt: Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      checkedAt: Schema.Union([
        Schema.Int.check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        ).check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
        Schema.Null,
      ]),
    }),
  ),
});
export type ListTaskChecklistItems400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskChecklistItems400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskChecklistItems401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskChecklistItems401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskChecklistItems403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskChecklistItems403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskChecklistItems404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskChecklistItems404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskChecklistItems500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskChecklistItems500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItemRequestJson = {
  readonly content: string;
  readonly state?: "todo" | "done";
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateTaskChecklistItemRequestJson = Schema.Struct({
  content: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  state: Schema.optionalKey(Schema.Literals(["todo", "done"])),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateTaskChecklistItem201 = {
  readonly checklistItem: {
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  };
};
export const CreateTaskChecklistItem201 = Schema.Struct({
  checklistItem: Schema.Struct({
    type: Schema.Literal("checklistItem"),
    id: Schema.String.annotate({ description: "Checklist item identifier" }),
    parentId: Schema.String.annotate({
      description: "Task or task-template identifier",
    }),
    parentType: Schema.Literals(["task", "template"]),
    state: Schema.Literals(["todo", "done"]),
    content: Schema.String,
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    checkedAt: Schema.Union([
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      Schema.Null,
    ]),
  }),
});
export type CreateTaskChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItem409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskTemplateChecklistItems200 = {
  readonly checklistItems: ReadonlyArray<{
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  }>;
};
export const ListTaskTemplateChecklistItems200 = Schema.Struct({
  checklistItems: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("checklistItem"),
      id: Schema.String.annotate({ description: "Checklist item identifier" }),
      parentId: Schema.String.annotate({
        description: "Task or task-template identifier",
      }),
      parentType: Schema.Literals(["task", "template"]),
      state: Schema.Literals(["todo", "done"]),
      content: Schema.String,
      createdAt: Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      checkedAt: Schema.Union([
        Schema.Int.check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        ).check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
        Schema.Null,
      ]),
    }),
  ),
});
export type ListTaskTemplateChecklistItems400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskTemplateChecklistItems400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskTemplateChecklistItems401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskTemplateChecklistItems401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskTemplateChecklistItems403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskTemplateChecklistItems403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskTemplateChecklistItems404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskTemplateChecklistItems404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListTaskTemplateChecklistItems500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListTaskTemplateChecklistItems500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItemRequestJson = {
  readonly content: string;
  readonly state?: "todo" | "done";
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateTaskTemplateChecklistItemRequestJson = Schema.Struct({
  content: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  state: Schema.optionalKey(Schema.Literals(["todo", "done"])),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateTaskTemplateChecklistItem201 = {
  readonly checklistItem: {
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  };
};
export const CreateTaskTemplateChecklistItem201 = Schema.Struct({
  checklistItem: Schema.Struct({
    type: Schema.Literal("checklistItem"),
    id: Schema.String.annotate({ description: "Checklist item identifier" }),
    parentId: Schema.String.annotate({
      description: "Task or task-template identifier",
    }),
    parentType: Schema.Literals(["task", "template"]),
    state: Schema.Literals(["todo", "done"]),
    content: Schema.String,
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    checkedAt: Schema.Union([
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      Schema.Null,
    ]),
  }),
});
export type CreateTaskTemplateChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItem409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateTaskTemplateChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateTaskTemplateChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetChecklistItem200 = {
  readonly checklistItem: {
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  };
};
export const GetChecklistItem200 = Schema.Struct({
  checklistItem: Schema.Struct({
    type: Schema.Literal("checklistItem"),
    id: Schema.String.annotate({ description: "Checklist item identifier" }),
    parentId: Schema.String.annotate({
      description: "Task or task-template identifier",
    }),
    parentType: Schema.Literals(["task", "template"]),
    state: Schema.Literals(["todo", "done"]),
    content: Schema.String,
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    checkedAt: Schema.Union([
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      Schema.Null,
    ]),
  }),
});
export type GetChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type GetChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const GetChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type DeleteChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const DeleteChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateChecklistItemRequestJson = {
  readonly content?: string;
  readonly state?: "todo" | "done";
};
export const UpdateChecklistItemRequestJson = Schema.Struct({
  content: Schema.optionalKey(
    Schema.String.check(
      Schema.isMinLength(1).annotate({
        expected: "a value with a length of at least 1",
      }),
    ),
  ),
  state: Schema.optionalKey(Schema.Literals(["todo", "done"])),
});
export type UpdateChecklistItem200 = {
  readonly checklistItem: {
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  };
};
export const UpdateChecklistItem200 = Schema.Struct({
  checklistItem: Schema.Struct({
    type: Schema.Literal("checklistItem"),
    id: Schema.String.annotate({ description: "Checklist item identifier" }),
    parentId: Schema.String.annotate({
      description: "Task or task-template identifier",
    }),
    parentType: Schema.Literals(["task", "template"]),
    state: Schema.Literals(["todo", "done"]),
    content: Schema.String,
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    checkedAt: Schema.Union([
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      Schema.Null,
    ]),
  }),
});
export type UpdateChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type UpdateChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const UpdateChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItemRequestJson = {
  readonly parentId: string;
  readonly parentType: "task" | "template";
  readonly placement:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const MoveChecklistItemRequestJson = Schema.Struct({
  parentId: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  parentType: Schema.Literals(["task", "template"]),
  placement: Schema.Union(
    [
      Schema.Struct({ kind: Schema.Literal("first") }),
      Schema.Struct({ kind: Schema.Literal("last") }),
      Schema.Struct({
        kind: Schema.Literal("before"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity before",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
      Schema.Struct({
        kind: Schema.Literal("after"),
        anchorId: Schema.String.annotate({
          description: "Sibling to place the entity after",
        }).check(
          Schema.isMinLength(1).annotate({
            expected: "a value with a length of at least 1",
          }),
        ),
      }),
    ],
    { mode: "oneOf" },
  ).annotate({ description: "Position within an ordered collection" }),
});
export type MoveChecklistItem200 = {
  readonly checklistItem: {
    readonly type: "checklistItem";
    readonly id: string;
    readonly parentId: string;
    readonly parentType: "task" | "template";
    readonly state: "todo" | "done";
    readonly content: string;
    readonly createdAt: number;
    readonly checkedAt: number | null;
  };
};
export const MoveChecklistItem200 = Schema.Struct({
  checklistItem: Schema.Struct({
    type: Schema.Literal("checklistItem"),
    id: Schema.String.annotate({ description: "Checklist item identifier" }),
    parentId: Schema.String.annotate({
      description: "Task or task-template identifier",
    }),
    parentType: Schema.Literals(["task", "template"]),
    state: Schema.Literals(["todo", "done"]),
    content: Schema.String,
    createdAt: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0).annotate({
        expected: "a value greater than or equal to 0",
      }),
    ).check(
      Schema.isLessThanOrEqualTo(9007199254740991).annotate({
        expected: "a value less than or equal to 9007199254740991",
      }),
    ),
    checkedAt: Schema.Union([
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      ).check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
      Schema.Null,
    ]),
  }),
});
export type MoveChecklistItem400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItem401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItem403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItem404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItem409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type MoveChecklistItem500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const MoveChecklistItem500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListStashTasksParams = { readonly state?: "todo" | "done" };
export const ListStashTasksParams = Schema.Struct({
  state: Schema.optionalKey(
    Schema.Literals(["todo", "done"]).annotate({ default: "todo" }),
  ),
});
export type ListStashTasks200 = {
  readonly tasks: ReadonlyArray<{
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  }>;
};
export const ListStashTasks200 = Schema.Struct({
  tasks: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("task"),
      id: Schema.String.annotate({ description: "Task identifier" }),
      title: Schema.String,
      content: Schema.optionalKey(Schema.String),
      state: Schema.Literals(["todo", "done"]),
      projectSectionId: Schema.String.annotate({
        description: "Parent project section identifier",
      }),
      nature: Schema.Literals(["red", "green", "unknown"]),
      createdAt: Schema.Number.annotate({
        description: "Creation time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      lastToggledAt: Schema.Number.annotate({
        description: "Last state change time as Unix milliseconds",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(0).annotate({
            expected: "a value greater than or equal to 0",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(9007199254740991).annotate({
            expected: "a value less than or equal to 9007199254740991",
          }),
        ),
      scheduledDate: Schema.Union([
        Schema.String.annotate({ format: "date" }).check(
          Schema.isPattern(
            new globalThis.RegExp(
              "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
              "u",
            ),
          ).annotate({
            expected:
              "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Current schedule date, or null when the task is unscheduled",
      }),
      scheduledTime: Schema.Union([
        Schema.String.annotate({
          description:
            "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
        }).check(
          Schema.isPattern(
            new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
          ).annotate({
            expected:
              "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
          }),
        ),
        Schema.Null,
      ]).annotate({
        description:
          "Time on the schedule date in HH:mm, or null when the task has no time",
      }),
      durationMinutes: Schema.Union([
        Schema.Number.annotate({
          description: "Estimated duration in whole minutes",
        })
          .check(Schema.isInt().annotate({ expected: "an integer" }))
          .check(
            Schema.isGreaterThanOrEqualTo(1).annotate({
              expected: "a value greater than or equal to 1",
            }),
          )
          .check(
            Schema.isLessThanOrEqualTo(10080).annotate({
              expected: "a value less than or equal to 10080",
            }),
          ),
        Schema.Null,
      ]),
    }),
  ),
}).annotate({ description: "Tasks in stash display order" });
export type ListStashTasks400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListStashTasks400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListStashTasks401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListStashTasks401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListStashTasks403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListStashTasks403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListStashTasks404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListStashTasks404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type ListStashTasks500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const ListStashTasks500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTaskRequestJson = {
  readonly title: string;
  readonly content?: string;
  readonly nature?: "red" | "green" | "unknown";
  readonly durationMinutes?: number;
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const CreateStashTaskRequestJson = Schema.Struct({
  title: Schema.String.check(
    Schema.isMinLength(1).annotate({
      expected: "a value with a length of at least 1",
    }),
  ),
  content: Schema.optionalKey(Schema.String),
  nature: Schema.optionalKey(Schema.Literals(["red", "green", "unknown"])),
  durationMinutes: Schema.optionalKey(
    Schema.Number.annotate({
      description: "Estimated duration in whole minutes",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(1).annotate({
          expected: "a value greater than or equal to 1",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(10080).annotate({
          expected: "a value less than or equal to 10080",
        }),
      ),
  ),
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type CreateStashTask201 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const CreateStashTask201 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type CreateStashTask400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTask401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTask403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTask404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTask409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type CreateStashTask500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const CreateStashTask500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStashRequestJson = {
  readonly placement?:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "before"; readonly anchorId: string }
    | { readonly kind: "after"; readonly anchorId: string };
};
export const PutTaskInStashRequestJson = Schema.Struct({
  placement: Schema.optionalKey(
    Schema.Union(
      [
        Schema.Struct({ kind: Schema.Literal("first") }),
        Schema.Struct({ kind: Schema.Literal("last") }),
        Schema.Struct({
          kind: Schema.Literal("before"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity before",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
        Schema.Struct({
          kind: Schema.Literal("after"),
          anchorId: Schema.String.annotate({
            description: "Sibling to place the entity after",
          }).check(
            Schema.isMinLength(1).annotate({
              expected: "a value with a length of at least 1",
            }),
          ),
        }),
      ],
      { mode: "oneOf" },
    ).annotate({ description: "Position within an ordered collection" }),
  ),
});
export type PutTaskInStash200 = {
  readonly task: {
    readonly type: "task";
    readonly id: string;
    readonly title: string;
    readonly content?: string;
    readonly state: "todo" | "done";
    readonly projectSectionId: string;
    readonly nature: "red" | "green" | "unknown";
    readonly createdAt: number;
    readonly lastToggledAt: number;
    readonly scheduledDate: string | null;
    readonly scheduledTime: string | null;
    readonly durationMinutes: number | null;
  };
};
export const PutTaskInStash200 = Schema.Struct({
  task: Schema.Struct({
    type: Schema.Literal("task"),
    id: Schema.String.annotate({ description: "Task identifier" }),
    title: Schema.String,
    content: Schema.optionalKey(Schema.String),
    state: Schema.Literals(["todo", "done"]),
    projectSectionId: Schema.String.annotate({
      description: "Parent project section identifier",
    }),
    nature: Schema.Literals(["red", "green", "unknown"]),
    createdAt: Schema.Number.annotate({
      description: "Creation time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    lastToggledAt: Schema.Number.annotate({
      description: "Last state change time as Unix milliseconds",
    })
      .check(Schema.isInt().annotate({ expected: "an integer" }))
      .check(
        Schema.isGreaterThanOrEqualTo(0).annotate({
          expected: "a value greater than or equal to 0",
        }),
      )
      .check(
        Schema.isLessThanOrEqualTo(9007199254740991).annotate({
          expected: "a value less than or equal to 9007199254740991",
        }),
      ),
    scheduledDate: Schema.Union([
      Schema.String.annotate({ format: "date" }).check(
        Schema.isPattern(
          new globalThis.RegExp(
            "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
            "u",
          ),
        ).annotate({
          expected:
            "a string matching the RegExp ^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Current schedule date, or null when the task is unscheduled",
    }),
    scheduledTime: Schema.Union([
      Schema.String.annotate({
        description:
          "Floating wall-clock time in 24-hour HH:mm format, without a time zone",
      }).check(
        Schema.isPattern(
          new globalThis.RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u"),
        ).annotate({
          expected: "a string matching the RegExp ^([01]\\d|2[0-3]):[0-5]\\d$",
        }),
      ),
      Schema.Null,
    ]).annotate({
      description:
        "Time on the schedule date in HH:mm, or null when the task has no time",
    }),
    durationMinutes: Schema.Union([
      Schema.Number.annotate({
        description: "Estimated duration in whole minutes",
      })
        .check(Schema.isInt().annotate({ expected: "an integer" }))
        .check(
          Schema.isGreaterThanOrEqualTo(1).annotate({
            expected: "a value greater than or equal to 1",
          }),
        )
        .check(
          Schema.isLessThanOrEqualTo(10080).annotate({
            expected: "a value less than or equal to 10080",
          }),
        ),
      Schema.Null,
    ]),
  }),
}).annotate({ description: "Task details" });
export type PutTaskInStash400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStash401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStash403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStash404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStash409 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash409 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type PutTaskInStash500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const PutTaskInStash500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type RemoveTaskFromStash400 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const RemoveTaskFromStash400 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type RemoveTaskFromStash401 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const RemoveTaskFromStash401 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type RemoveTaskFromStash403 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const RemoveTaskFromStash403 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type RemoveTaskFromStash404 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const RemoveTaskFromStash404 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });
export type RemoveTaskFromStash500 = {
  readonly code:
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "INTERNAL_SERVER_ERROR";
  readonly message: string;
};
export const RemoveTaskFromStash500 = Schema.Struct({
  code: Schema.Literals([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_SERVER_ERROR",
  ]),
  message: Schema.String,
}).annotate({ description: "Error response" });

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to `true`, a tuple of `[A, HttpClientResponse]` will be returned,
   * where `A` is the success type of the operation.
   *
   * If set to `false`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined;
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the `includeResponse` configuration
 * option.
 */
export type WithOptionalResponse<
  A,
  Config extends OperationConfig | undefined,
> = Config extends {
  readonly includeResponse: true;
}
  ? [A, HttpClientResponse.HttpClientResponse]
  : Config extends { readonly includeResponse?: false | undefined } | undefined
    ? A
    : A | [A, HttpClientResponse.HttpClientResponse];

export const make = <E, R>(
  httpClient: HttpClient.HttpClient.With<E, R>,
  options: {
    readonly transformClient?:
      | ((
          client: HttpClient.HttpClient.With<E, R>,
        ) => Effect.Effect<HttpClient.HttpClient.With<E, R>>)
      | undefined;
  } = {},
): WbdApi<E, R> => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description:
                typeof description === "string"
                  ? description
                  : JSON.stringify(description),
            }),
          }),
        ),
    );
  const withResponse =
    <Config extends OperationConfig>(config: Config | undefined) =>
    (
      f: (
        response: HttpClientResponse.HttpClientResponse,
      ) => Effect.Effect<any, any>,
    ): ((
      request: HttpClientRequest.HttpClientRequest,
    ) => Effect.Effect<any, any, R>) => {
      const withOptionalResponse = (
        config?.includeResponse
          ? (response: HttpClientResponse.HttpClientResponse) =>
              Effect.map(f(response), (a) => [a, response])
          : (response: HttpClientResponse.HttpClientResponse) => f(response)
      ) as any;
      return options?.transformClient
        ? (request) =>
            Effect.flatMap(
              Effect.flatMap(options.transformClient!(httpClient), (client) =>
                client.execute(request),
              ),
              withOptionalResponse,
            )
        : (request) =>
            Effect.flatMap(httpClient.execute(request), withOptionalResponse);
    };
  const __encodePathParam = encodeURIComponent;
  const __makePathRequest = (
    method: (url: string) => HttpClientRequest.HttpClientRequest,
    parameters: ReadonlyArray<string>,
    getPath: () => string,
  ) =>
    Effect.suspend(() => {
      const fail = (description: string, cause?: unknown) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.InvalidUrlError({
              request: method(""),
              cause,
              description,
            }),
          }),
        );
      if (
        parameters.some(
          (value) => value === "" || /^(?:\.|%2e){1,2}$/i.test(value),
        )
      ) {
        return fail(
          "Path parameters must be non-empty and cannot be dot segments",
        );
      }
      let path: string;
      try {
        path = getPath();
      } catch (cause) {
        return fail("Failed to encode path parameter", cause);
      }
      if (
        path.split("/").some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
      ) {
        return fail("Request paths cannot contain dot segments");
      }
      return Effect.succeed(method(path));
    });
  const decodeSuccess =
    <Schema extends Schema.Constraint>(schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response);
  const decodeError =
    <const Tag extends string, Schema extends Schema.Constraint>(
      tag: Tag,
      schema: Schema,
    ) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(schema)(response),
        (cause) => Effect.fail(WbdApiError(tag, cause, response)),
      );
  return {
    httpClient,
    listSpaces: (options: Parameters<WbdApi["listSpaces"]>[0]) =>
      HttpClientRequest.get("/api/v1/spaces").pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListSpaces200),
            "401": decodeError("ListSpaces401", ListSpaces401),
            "500": decodeError("ListSpaces500", ListSpaces500),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    createSpace: (options: Parameters<WbdApi["createSpace"]>[0]) =>
      HttpClientRequest.post("/api/v1/spaces").pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(CreateSpace201),
            "400": decodeError("CreateSpace400", CreateSpace400),
            "401": decodeError("CreateSpace401", CreateSpace401),
            "500": decodeError("CreateSpace500", CreateSpace500),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    getSpace: (spaceId, options: Parameters<WbdApi["getSpace"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetSpace200),
                "400": decodeError("GetSpace400", GetSpace400),
                "401": decodeError("GetSpace401", GetSpace401),
                "403": decodeError("GetSpace403", GetSpace403),
                "404": decodeError("GetSpace404", GetSpace404),
                "500": decodeError("GetSpace500", GetSpace500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteSpace: (spaceId, options: Parameters<WbdApi["deleteSpace"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError("DeleteSpace400", DeleteSpace400),
                "401": decodeError("DeleteSpace401", DeleteSpace401),
                "404": decodeError("DeleteSpace404", DeleteSpace404),
                "500": decodeError("DeleteSpace500", DeleteSpace500),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateSpace: (spaceId, options: Parameters<WbdApi["updateSpace"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateSpace200),
                "400": decodeError("UpdateSpace400", UpdateSpace400),
                "401": decodeError("UpdateSpace401", UpdateSpace401),
                "404": decodeError("UpdateSpace404", UpdateSpace404),
                "500": decodeError("UpdateSpace500", UpdateSpace500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listProjects: (spaceId, options: Parameters<WbdApi["listProjects"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/projects",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListProjects200),
                "400": decodeError("ListProjects400", ListProjects400),
                "401": decodeError("ListProjects401", ListProjects401),
                "403": decodeError("ListProjects403", ListProjects403),
                "404": decodeError("ListProjects404", ListProjects404),
                "500": decodeError("ListProjects500", ListProjects500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createProject: (spaceId, options: Parameters<WbdApi["createProject"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/projects",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateProject201),
                "400": decodeError("CreateProject400", CreateProject400),
                "401": decodeError("CreateProject401", CreateProject401),
                "403": decodeError("CreateProject403", CreateProject403),
                "409": decodeError("CreateProject409", CreateProject409),
                "500": decodeError("CreateProject500", CreateProject500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getProject: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["getProject"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetProject200),
                "400": decodeError("GetProject400", GetProject400),
                "401": decodeError("GetProject401", GetProject401),
                "403": decodeError("GetProject403", GetProject403),
                "404": decodeError("GetProject404", GetProject404),
                "500": decodeError("GetProject500", GetProject500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteProject: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["deleteProject"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError("DeleteProject400", DeleteProject400),
                "401": decodeError("DeleteProject401", DeleteProject401),
                "403": decodeError("DeleteProject403", DeleteProject403),
                "404": decodeError("DeleteProject404", DeleteProject404),
                "409": decodeError("DeleteProject409", DeleteProject409),
                "500": decodeError("DeleteProject500", DeleteProject500),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateProject: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["updateProject"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateProject200),
                "400": decodeError("UpdateProject400", UpdateProject400),
                "401": decodeError("UpdateProject401", UpdateProject401),
                "403": decodeError("UpdateProject403", UpdateProject403),
                "404": decodeError("UpdateProject404", UpdateProject404),
                "409": decodeError("UpdateProject409", UpdateProject409),
                "500": decodeError("UpdateProject500", UpdateProject500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveProject: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["moveProject"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveProject200),
                "400": decodeError("MoveProject400", MoveProject400),
                "401": decodeError("MoveProject401", MoveProject401),
                "403": decodeError("MoveProject403", MoveProject403),
                "404": decodeError("MoveProject404", MoveProject404),
                "409": decodeError("MoveProject409", MoveProject409),
                "500": decodeError("MoveProject500", MoveProject500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listProjectSections: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["listProjectSections"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "/sections",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListProjectSections200),
                "400": decodeError(
                  "ListProjectSections400",
                  ListProjectSections400,
                ),
                "401": decodeError(
                  "ListProjectSections401",
                  ListProjectSections401,
                ),
                "403": decodeError(
                  "ListProjectSections403",
                  ListProjectSections403,
                ),
                "404": decodeError(
                  "ListProjectSections404",
                  ListProjectSections404,
                ),
                "500": decodeError(
                  "ListProjectSections500",
                  ListProjectSections500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createProjectSection: (
      spaceId,
      projectId,
      options: Parameters<WbdApi["createProjectSection"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, projectId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/projects/" +
          __encodePathParam(projectId) +
          "/sections",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateProjectSection201),
                "400": decodeError(
                  "CreateProjectSection400",
                  CreateProjectSection400,
                ),
                "401": decodeError(
                  "CreateProjectSection401",
                  CreateProjectSection401,
                ),
                "403": decodeError(
                  "CreateProjectSection403",
                  CreateProjectSection403,
                ),
                "404": decodeError(
                  "CreateProjectSection404",
                  CreateProjectSection404,
                ),
                "409": decodeError(
                  "CreateProjectSection409",
                  CreateProjectSection409,
                ),
                "500": decodeError(
                  "CreateProjectSection500",
                  CreateProjectSection500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getProjectSection: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["getProjectSection"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetProjectSection200),
                "400": decodeError(
                  "GetProjectSection400",
                  GetProjectSection400,
                ),
                "401": decodeError(
                  "GetProjectSection401",
                  GetProjectSection401,
                ),
                "403": decodeError(
                  "GetProjectSection403",
                  GetProjectSection403,
                ),
                "404": decodeError(
                  "GetProjectSection404",
                  GetProjectSection404,
                ),
                "500": decodeError(
                  "GetProjectSection500",
                  GetProjectSection500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteProjectSection: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["deleteProjectSection"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError(
                  "DeleteProjectSection400",
                  DeleteProjectSection400,
                ),
                "401": decodeError(
                  "DeleteProjectSection401",
                  DeleteProjectSection401,
                ),
                "403": decodeError(
                  "DeleteProjectSection403",
                  DeleteProjectSection403,
                ),
                "404": decodeError(
                  "DeleteProjectSection404",
                  DeleteProjectSection404,
                ),
                "409": decodeError(
                  "DeleteProjectSection409",
                  DeleteProjectSection409,
                ),
                "500": decodeError(
                  "DeleteProjectSection500",
                  DeleteProjectSection500,
                ),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateProjectSection: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["updateProjectSection"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateProjectSection200),
                "400": decodeError(
                  "UpdateProjectSection400",
                  UpdateProjectSection400,
                ),
                "401": decodeError(
                  "UpdateProjectSection401",
                  UpdateProjectSection401,
                ),
                "403": decodeError(
                  "UpdateProjectSection403",
                  UpdateProjectSection403,
                ),
                "404": decodeError(
                  "UpdateProjectSection404",
                  UpdateProjectSection404,
                ),
                "409": decodeError(
                  "UpdateProjectSection409",
                  UpdateProjectSection409,
                ),
                "500": decodeError(
                  "UpdateProjectSection500",
                  UpdateProjectSection500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveProjectSection: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["moveProjectSection"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveProjectSection200),
                "400": decodeError(
                  "MoveProjectSection400",
                  MoveProjectSection400,
                ),
                "401": decodeError(
                  "MoveProjectSection401",
                  MoveProjectSection401,
                ),
                "403": decodeError(
                  "MoveProjectSection403",
                  MoveProjectSection403,
                ),
                "404": decodeError(
                  "MoveProjectSection404",
                  MoveProjectSection404,
                ),
                "409": decodeError(
                  "MoveProjectSection409",
                  MoveProjectSection409,
                ),
                "500": decodeError(
                  "MoveProjectSection500",
                  MoveProjectSection500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listTasks: (spaceId, options: Parameters<WbdApi["listTasks"]>[1]) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/tasks",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              cursor: options?.params?.["cursor"] as any,
              limit: options?.params?.["limit"] as any,
            }),
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListTasks200),
                "400": decodeError("ListTasks400", ListTasks400),
                "401": decodeError("ListTasks401", ListTasks401),
                "403": decodeError("ListTasks403", ListTasks403),
                "404": decodeError("ListTasks404", ListTasks404),
                "500": decodeError("ListTasks500", ListTasks500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listScheduledTasks: (
      spaceId,
      options: Parameters<WbdApi["listScheduledTasks"]>[1],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () =>
          "/api/v1/spaces/" + __encodePathParam(spaceId) + "/scheduled-tasks",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              scope: options.params["scope"] as any,
              relativeTo: options.params["relativeTo"] as any,
              to: options.params["to"] as any,
              cursor: options.params["cursor"] as any,
              limit: options.params["limit"] as any,
            }),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListScheduledTasks200),
                "400": decodeError(
                  "ListScheduledTasks400",
                  ListScheduledTasks400,
                ),
                "401": decodeError(
                  "ListScheduledTasks401",
                  ListScheduledTasks401,
                ),
                "403": decodeError(
                  "ListScheduledTasks403",
                  ListScheduledTasks403,
                ),
                "404": decodeError(
                  "ListScheduledTasks404",
                  ListScheduledTasks404,
                ),
                "500": decodeError(
                  "ListScheduledTasks500",
                  ListScheduledTasks500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listSectionItems: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["listSectionItems"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "/items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              taskState: options?.params?.["taskState"] as any,
            }),
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListSectionItems200),
                "400": decodeError("ListSectionItems400", ListSectionItems400),
                "401": decodeError("ListSectionItems401", ListSectionItems401),
                "403": decodeError("ListSectionItems403", ListSectionItems403),
                "404": decodeError("ListSectionItems404", ListSectionItems404),
                "500": decodeError("ListSectionItems500", ListSectionItems500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createSectionTask: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["createSectionTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "/tasks",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateSectionTask201),
                "400": decodeError(
                  "CreateSectionTask400",
                  CreateSectionTask400,
                ),
                "401": decodeError(
                  "CreateSectionTask401",
                  CreateSectionTask401,
                ),
                "403": decodeError(
                  "CreateSectionTask403",
                  CreateSectionTask403,
                ),
                "404": decodeError(
                  "CreateSectionTask404",
                  CreateSectionTask404,
                ),
                "409": decodeError(
                  "CreateSectionTask409",
                  CreateSectionTask409,
                ),
                "500": decodeError(
                  "CreateSectionTask500",
                  CreateSectionTask500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getTask: (spaceId, taskId, options: Parameters<WbdApi["getTask"]>[2]) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetTask200),
                "400": decodeError("GetTask400", GetTask400),
                "401": decodeError("GetTask401", GetTask401),
                "403": decodeError("GetTask403", GetTask403),
                "404": decodeError("GetTask404", GetTask404),
                "500": decodeError("GetTask500", GetTask500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteTask: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["deleteTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError("DeleteTask400", DeleteTask400),
                "401": decodeError("DeleteTask401", DeleteTask401),
                "403": decodeError("DeleteTask403", DeleteTask403),
                "404": decodeError("DeleteTask404", DeleteTask404),
                "500": decodeError("DeleteTask500", DeleteTask500),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateTask: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["updateTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateTask200),
                "400": decodeError("UpdateTask400", UpdateTask400),
                "401": decodeError("UpdateTask401", UpdateTask401),
                "403": decodeError("UpdateTask403", UpdateTask403),
                "404": decodeError("UpdateTask404", UpdateTask404),
                "409": decodeError("UpdateTask409", UpdateTask409),
                "500": decodeError("UpdateTask500", UpdateTask500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    scheduleTask: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["scheduleTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/schedule",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ScheduleTask200),
                "400": decodeError("ScheduleTask400", ScheduleTask400),
                "401": decodeError("ScheduleTask401", ScheduleTask401),
                "403": decodeError("ScheduleTask403", ScheduleTask403),
                "404": decodeError("ScheduleTask404", ScheduleTask404),
                "409": decodeError("ScheduleTask409", ScheduleTask409),
                "500": decodeError("ScheduleTask500", ScheduleTask500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    clearTaskSchedule: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["clearTaskSchedule"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/schedule",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError(
                  "ClearTaskSchedule400",
                  ClearTaskSchedule400,
                ),
                "401": decodeError(
                  "ClearTaskSchedule401",
                  ClearTaskSchedule401,
                ),
                "403": decodeError(
                  "ClearTaskSchedule403",
                  ClearTaskSchedule403,
                ),
                "404": decodeError(
                  "ClearTaskSchedule404",
                  ClearTaskSchedule404,
                ),
                "500": decodeError(
                  "ClearTaskSchedule500",
                  ClearTaskSchedule500,
                ),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveTask: (spaceId, taskId, options: Parameters<WbdApi["moveTask"]>[2]) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveTask200),
                "400": decodeError("MoveTask400", MoveTask400),
                "401": decodeError("MoveTask401", MoveTask401),
                "403": decodeError("MoveTask403", MoveTask403),
                "404": decodeError("MoveTask404", MoveTask404),
                "409": decodeError("MoveTask409", MoveTask409),
                "500": decodeError("MoveTask500", MoveTask500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listDailyLists: (
      spaceId,
      options: Parameters<WbdApi["listDailyLists"]>[1],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/daily-lists",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              from: options.params["from"] as any,
              to: options.params["to"] as any,
              state: options.params["state"] as any,
              cursor: options.params["cursor"] as any,
              limit: options.params["limit"] as any,
            }),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListDailyLists200),
                "400": decodeError("ListDailyLists400", ListDailyLists400),
                "401": decodeError("ListDailyLists401", ListDailyLists401),
                "403": decodeError("ListDailyLists403", ListDailyLists403),
                "404": decodeError("ListDailyLists404", ListDailyLists404),
                "500": decodeError("ListDailyLists500", ListDailyLists500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listDailyListItems: (
      spaceId,
      date,
      options: Parameters<WbdApi["listDailyListItems"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, date],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/daily-lists/" +
          __encodePathParam(date) +
          "/items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              state: options?.params?.["state"] as any,
            }),
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListDailyListItems200),
                "400": decodeError(
                  "ListDailyListItems400",
                  ListDailyListItems400,
                ),
                "401": decodeError(
                  "ListDailyListItems401",
                  ListDailyListItems401,
                ),
                "403": decodeError(
                  "ListDailyListItems403",
                  ListDailyListItems403,
                ),
                "404": decodeError(
                  "ListDailyListItems404",
                  ListDailyListItems404,
                ),
                "500": decodeError(
                  "ListDailyListItems500",
                  ListDailyListItems500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createTaskTemplate: (
      spaceId,
      sectionId,
      options: Parameters<WbdApi["createTaskTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, sectionId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/sections/" +
          __encodePathParam(sectionId) +
          "/task-templates",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateTaskTemplate201),
                "400": decodeError(
                  "CreateTaskTemplate400",
                  CreateTaskTemplate400,
                ),
                "401": decodeError(
                  "CreateTaskTemplate401",
                  CreateTaskTemplate401,
                ),
                "403": decodeError(
                  "CreateTaskTemplate403",
                  CreateTaskTemplate403,
                ),
                "404": decodeError(
                  "CreateTaskTemplate404",
                  CreateTaskTemplate404,
                ),
                "409": decodeError(
                  "CreateTaskTemplate409",
                  CreateTaskTemplate409,
                ),
                "500": decodeError(
                  "CreateTaskTemplate500",
                  CreateTaskTemplate500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getTaskTemplate: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["getTaskTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetTaskTemplate200),
                "400": decodeError("GetTaskTemplate400", GetTaskTemplate400),
                "401": decodeError("GetTaskTemplate401", GetTaskTemplate401),
                "403": decodeError("GetTaskTemplate403", GetTaskTemplate403),
                "404": decodeError("GetTaskTemplate404", GetTaskTemplate404),
                "500": decodeError("GetTaskTemplate500", GetTaskTemplate500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteTaskTemplate: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["deleteTaskTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError(
                  "DeleteTaskTemplate400",
                  DeleteTaskTemplate400,
                ),
                "401": decodeError(
                  "DeleteTaskTemplate401",
                  DeleteTaskTemplate401,
                ),
                "403": decodeError(
                  "DeleteTaskTemplate403",
                  DeleteTaskTemplate403,
                ),
                "404": decodeError(
                  "DeleteTaskTemplate404",
                  DeleteTaskTemplate404,
                ),
                "500": decodeError(
                  "DeleteTaskTemplate500",
                  DeleteTaskTemplate500,
                ),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateTaskTemplate: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["updateTaskTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateTaskTemplate200),
                "400": decodeError(
                  "UpdateTaskTemplate400",
                  UpdateTaskTemplate400,
                ),
                "401": decodeError(
                  "UpdateTaskTemplate401",
                  UpdateTaskTemplate401,
                ),
                "403": decodeError(
                  "UpdateTaskTemplate403",
                  UpdateTaskTemplate403,
                ),
                "404": decodeError(
                  "UpdateTaskTemplate404",
                  UpdateTaskTemplate404,
                ),
                "500": decodeError(
                  "UpdateTaskTemplate500",
                  UpdateTaskTemplate500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveTaskTemplate: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["moveTaskTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveTaskTemplate200),
                "400": decodeError("MoveTaskTemplate400", MoveTaskTemplate400),
                "401": decodeError("MoveTaskTemplate401", MoveTaskTemplate401),
                "403": decodeError("MoveTaskTemplate403", MoveTaskTemplate403),
                "404": decodeError("MoveTaskTemplate404", MoveTaskTemplate404),
                "409": decodeError("MoveTaskTemplate409", MoveTaskTemplate409),
                "500": decodeError("MoveTaskTemplate500", MoveTaskTemplate500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    convertTaskToTemplate: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["convertTaskToTemplate"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/convert-to-template",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ConvertTaskToTemplate200),
                "400": decodeError(
                  "ConvertTaskToTemplate400",
                  ConvertTaskToTemplate400,
                ),
                "401": decodeError(
                  "ConvertTaskToTemplate401",
                  ConvertTaskToTemplate401,
                ),
                "403": decodeError(
                  "ConvertTaskToTemplate403",
                  ConvertTaskToTemplate403,
                ),
                "404": decodeError(
                  "ConvertTaskToTemplate404",
                  ConvertTaskToTemplate404,
                ),
                "500": decodeError(
                  "ConvertTaskToTemplate500",
                  ConvertTaskToTemplate500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    convertTaskTemplateToTask: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["convertTaskTemplateToTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "/convert-to-task",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ConvertTaskTemplateToTask200),
                "400": decodeError(
                  "ConvertTaskTemplateToTask400",
                  ConvertTaskTemplateToTask400,
                ),
                "401": decodeError(
                  "ConvertTaskTemplateToTask401",
                  ConvertTaskTemplateToTask401,
                ),
                "403": decodeError(
                  "ConvertTaskTemplateToTask403",
                  ConvertTaskTemplateToTask403,
                ),
                "404": decodeError(
                  "ConvertTaskTemplateToTask404",
                  ConvertTaskTemplateToTask404,
                ),
                "500": decodeError(
                  "ConvertTaskTemplateToTask500",
                  ConvertTaskTemplateToTask500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getNote: (spaceId, noteId, options: Parameters<WbdApi["getNote"]>[2]) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, noteId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/notes/" +
          __encodePathParam(noteId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetNote200),
                "400": decodeError("GetNote400", GetNote400),
                "401": decodeError("GetNote401", GetNote401),
                "403": decodeError("GetNote403", GetNote403),
                "404": decodeError("GetNote404", GetNote404),
                "500": decodeError("GetNote500", GetNote500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteNote: (
      spaceId,
      noteId,
      options: Parameters<WbdApi["deleteNote"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, noteId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/notes/" +
          __encodePathParam(noteId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError("DeleteNote400", DeleteNote400),
                "401": decodeError("DeleteNote401", DeleteNote401),
                "403": decodeError("DeleteNote403", DeleteNote403),
                "404": decodeError("DeleteNote404", DeleteNote404),
                "500": decodeError("DeleteNote500", DeleteNote500),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateNote: (
      spaceId,
      noteId,
      options: Parameters<WbdApi["updateNote"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, noteId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/notes/" +
          __encodePathParam(noteId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateNote200),
                "400": decodeError("UpdateNote400", UpdateNote400),
                "401": decodeError("UpdateNote401", UpdateNote401),
                "403": decodeError("UpdateNote403", UpdateNote403),
                "404": decodeError("UpdateNote404", UpdateNote404),
                "500": decodeError("UpdateNote500", UpdateNote500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveNote: (spaceId, noteId, options: Parameters<WbdApi["moveNote"]>[2]) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, noteId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/notes/" +
          __encodePathParam(noteId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveNote200),
                "400": decodeError("MoveNote400", MoveNote400),
                "401": decodeError("MoveNote401", MoveNote401),
                "403": decodeError("MoveNote403", MoveNote403),
                "404": decodeError("MoveNote404", MoveNote404),
                "409": decodeError("MoveNote409", MoveNote409),
                "500": decodeError("MoveNote500", MoveNote500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    convertTaskToNote: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["convertTaskToNote"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/convert-to-note",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ConvertTaskToNote200),
                "400": decodeError(
                  "ConvertTaskToNote400",
                  ConvertTaskToNote400,
                ),
                "401": decodeError(
                  "ConvertTaskToNote401",
                  ConvertTaskToNote401,
                ),
                "403": decodeError(
                  "ConvertTaskToNote403",
                  ConvertTaskToNote403,
                ),
                "404": decodeError(
                  "ConvertTaskToNote404",
                  ConvertTaskToNote404,
                ),
                "500": decodeError(
                  "ConvertTaskToNote500",
                  ConvertTaskToNote500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    convertNoteToTask: (
      spaceId,
      noteId,
      options: Parameters<WbdApi["convertNoteToTask"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, noteId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/notes/" +
          __encodePathParam(noteId) +
          "/convert-to-task",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ConvertNoteToTask200),
                "400": decodeError(
                  "ConvertNoteToTask400",
                  ConvertNoteToTask400,
                ),
                "401": decodeError(
                  "ConvertNoteToTask401",
                  ConvertNoteToTask401,
                ),
                "403": decodeError(
                  "ConvertNoteToTask403",
                  ConvertNoteToTask403,
                ),
                "404": decodeError(
                  "ConvertNoteToTask404",
                  ConvertNoteToTask404,
                ),
                "500": decodeError(
                  "ConvertNoteToTask500",
                  ConvertNoteToTask500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listTaskChecklistItems: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["listTaskChecklistItems"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/checklist-items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListTaskChecklistItems200),
                "400": decodeError(
                  "ListTaskChecklistItems400",
                  ListTaskChecklistItems400,
                ),
                "401": decodeError(
                  "ListTaskChecklistItems401",
                  ListTaskChecklistItems401,
                ),
                "403": decodeError(
                  "ListTaskChecklistItems403",
                  ListTaskChecklistItems403,
                ),
                "404": decodeError(
                  "ListTaskChecklistItems404",
                  ListTaskChecklistItems404,
                ),
                "500": decodeError(
                  "ListTaskChecklistItems500",
                  ListTaskChecklistItems500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createTaskChecklistItem: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["createTaskChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/tasks/" +
          __encodePathParam(taskId) +
          "/checklist-items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateTaskChecklistItem201),
                "400": decodeError(
                  "CreateTaskChecklistItem400",
                  CreateTaskChecklistItem400,
                ),
                "401": decodeError(
                  "CreateTaskChecklistItem401",
                  CreateTaskChecklistItem401,
                ),
                "403": decodeError(
                  "CreateTaskChecklistItem403",
                  CreateTaskChecklistItem403,
                ),
                "404": decodeError(
                  "CreateTaskChecklistItem404",
                  CreateTaskChecklistItem404,
                ),
                "409": decodeError(
                  "CreateTaskChecklistItem409",
                  CreateTaskChecklistItem409,
                ),
                "500": decodeError(
                  "CreateTaskChecklistItem500",
                  CreateTaskChecklistItem500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listTaskTemplateChecklistItems: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["listTaskTemplateChecklistItems"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "/checklist-items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListTaskTemplateChecklistItems200),
                "400": decodeError(
                  "ListTaskTemplateChecklistItems400",
                  ListTaskTemplateChecklistItems400,
                ),
                "401": decodeError(
                  "ListTaskTemplateChecklistItems401",
                  ListTaskTemplateChecklistItems401,
                ),
                "403": decodeError(
                  "ListTaskTemplateChecklistItems403",
                  ListTaskTemplateChecklistItems403,
                ),
                "404": decodeError(
                  "ListTaskTemplateChecklistItems404",
                  ListTaskTemplateChecklistItems404,
                ),
                "500": decodeError(
                  "ListTaskTemplateChecklistItems500",
                  ListTaskTemplateChecklistItems500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createTaskTemplateChecklistItem: (
      spaceId,
      templateId,
      options: Parameters<WbdApi["createTaskTemplateChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, templateId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/task-templates/" +
          __encodePathParam(templateId) +
          "/checklist-items",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateTaskTemplateChecklistItem201),
                "400": decodeError(
                  "CreateTaskTemplateChecklistItem400",
                  CreateTaskTemplateChecklistItem400,
                ),
                "401": decodeError(
                  "CreateTaskTemplateChecklistItem401",
                  CreateTaskTemplateChecklistItem401,
                ),
                "403": decodeError(
                  "CreateTaskTemplateChecklistItem403",
                  CreateTaskTemplateChecklistItem403,
                ),
                "404": decodeError(
                  "CreateTaskTemplateChecklistItem404",
                  CreateTaskTemplateChecklistItem404,
                ),
                "409": decodeError(
                  "CreateTaskTemplateChecklistItem409",
                  CreateTaskTemplateChecklistItem409,
                ),
                "500": decodeError(
                  "CreateTaskTemplateChecklistItem500",
                  CreateTaskTemplateChecklistItem500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    getChecklistItem: (
      spaceId,
      checklistItemId,
      options: Parameters<WbdApi["getChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId, checklistItemId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/checklist-items/" +
          __encodePathParam(checklistItemId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(GetChecklistItem200),
                "400": decodeError("GetChecklistItem400", GetChecklistItem400),
                "401": decodeError("GetChecklistItem401", GetChecklistItem401),
                "403": decodeError("GetChecklistItem403", GetChecklistItem403),
                "404": decodeError("GetChecklistItem404", GetChecklistItem404),
                "500": decodeError("GetChecklistItem500", GetChecklistItem500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    deleteChecklistItem: (
      spaceId,
      checklistItemId,
      options: Parameters<WbdApi["deleteChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, checklistItemId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/checklist-items/" +
          __encodePathParam(checklistItemId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError(
                  "DeleteChecklistItem400",
                  DeleteChecklistItem400,
                ),
                "401": decodeError(
                  "DeleteChecklistItem401",
                  DeleteChecklistItem401,
                ),
                "403": decodeError(
                  "DeleteChecklistItem403",
                  DeleteChecklistItem403,
                ),
                "404": decodeError(
                  "DeleteChecklistItem404",
                  DeleteChecklistItem404,
                ),
                "500": decodeError(
                  "DeleteChecklistItem500",
                  DeleteChecklistItem500,
                ),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    updateChecklistItem: (
      spaceId,
      checklistItemId,
      options: Parameters<WbdApi["updateChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.patch,
        [spaceId, checklistItemId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/checklist-items/" +
          __encodePathParam(checklistItemId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(UpdateChecklistItem200),
                "400": decodeError(
                  "UpdateChecklistItem400",
                  UpdateChecklistItem400,
                ),
                "401": decodeError(
                  "UpdateChecklistItem401",
                  UpdateChecklistItem401,
                ),
                "403": decodeError(
                  "UpdateChecklistItem403",
                  UpdateChecklistItem403,
                ),
                "404": decodeError(
                  "UpdateChecklistItem404",
                  UpdateChecklistItem404,
                ),
                "500": decodeError(
                  "UpdateChecklistItem500",
                  UpdateChecklistItem500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    moveChecklistItem: (
      spaceId,
      checklistItemId,
      options: Parameters<WbdApi["moveChecklistItem"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId, checklistItemId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/checklist-items/" +
          __encodePathParam(checklistItemId) +
          "/move",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(MoveChecklistItem200),
                "400": decodeError(
                  "MoveChecklistItem400",
                  MoveChecklistItem400,
                ),
                "401": decodeError(
                  "MoveChecklistItem401",
                  MoveChecklistItem401,
                ),
                "403": decodeError(
                  "MoveChecklistItem403",
                  MoveChecklistItem403,
                ),
                "404": decodeError(
                  "MoveChecklistItem404",
                  MoveChecklistItem404,
                ),
                "409": decodeError(
                  "MoveChecklistItem409",
                  MoveChecklistItem409,
                ),
                "500": decodeError(
                  "MoveChecklistItem500",
                  MoveChecklistItem500,
                ),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    listStashTasks: (
      spaceId,
      options: Parameters<WbdApi["listStashTasks"]>[1],
    ) =>
      __makePathRequest(
        HttpClientRequest.get,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/stash/tasks",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.setUrlParams({
              state: options?.params?.["state"] as any,
            }),
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(ListStashTasks200),
                "400": decodeError("ListStashTasks400", ListStashTasks400),
                "401": decodeError("ListStashTasks401", ListStashTasks401),
                "403": decodeError("ListStashTasks403", ListStashTasks403),
                "404": decodeError("ListStashTasks404", ListStashTasks404),
                "500": decodeError("ListStashTasks500", ListStashTasks500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    createStashTask: (
      spaceId,
      options: Parameters<WbdApi["createStashTask"]>[1],
    ) =>
      __makePathRequest(
        HttpClientRequest.post,
        [spaceId],
        () => "/api/v1/spaces/" + __encodePathParam(spaceId) + "/stash/tasks",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(CreateStashTask201),
                "400": decodeError("CreateStashTask400", CreateStashTask400),
                "401": decodeError("CreateStashTask401", CreateStashTask401),
                "403": decodeError("CreateStashTask403", CreateStashTask403),
                "404": decodeError("CreateStashTask404", CreateStashTask404),
                "409": decodeError("CreateStashTask409", CreateStashTask409),
                "500": decodeError("CreateStashTask500", CreateStashTask500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    putTaskInStash: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["putTaskInStash"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.put,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/stash/tasks/" +
          __encodePathParam(taskId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            HttpClientRequest.bodyJsonUnsafe(options.payload),
            withResponse(options.config)(
              HttpClientResponse.matchStatus({
                "2xx": decodeSuccess(PutTaskInStash200),
                "400": decodeError("PutTaskInStash400", PutTaskInStash400),
                "401": decodeError("PutTaskInStash401", PutTaskInStash401),
                "403": decodeError("PutTaskInStash403", PutTaskInStash403),
                "404": decodeError("PutTaskInStash404", PutTaskInStash404),
                "409": decodeError("PutTaskInStash409", PutTaskInStash409),
                "500": decodeError("PutTaskInStash500", PutTaskInStash500),
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
    removeTaskFromStash: (
      spaceId,
      taskId,
      options: Parameters<WbdApi["removeTaskFromStash"]>[2],
    ) =>
      __makePathRequest(
        HttpClientRequest.delete,
        [spaceId, taskId],
        () =>
          "/api/v1/spaces/" +
          __encodePathParam(spaceId) +
          "/stash/tasks/" +
          __encodePathParam(taskId) +
          "",
      ).pipe(
        Effect.flatMap((request) =>
          request.pipe(
            withResponse(options?.config)(
              HttpClientResponse.matchStatus({
                "400": decodeError(
                  "RemoveTaskFromStash400",
                  RemoveTaskFromStash400,
                ),
                "401": decodeError(
                  "RemoveTaskFromStash401",
                  RemoveTaskFromStash401,
                ),
                "403": decodeError(
                  "RemoveTaskFromStash403",
                  RemoveTaskFromStash403,
                ),
                "404": decodeError(
                  "RemoveTaskFromStash404",
                  RemoveTaskFromStash404,
                ),
                "500": decodeError(
                  "RemoveTaskFromStash500",
                  RemoveTaskFromStash500,
                ),
                "204": () => Effect.void,
                orElse: unexpectedStatus,
              }),
            ),
          ),
        ),
      ),
  };
};

export interface WbdApi<E = HttpClientError.HttpClientError, R = never> {
  readonly httpClient: HttpClient.HttpClient.With<E, R>;
  /**
   * Returns the spaces belonging to the authenticated user.
   */
  readonly listSpaces: {
    <Config extends OperationConfig | undefined = undefined>(options: {
      readonly config: Config;
    }): Effect.Effect<
      WithOptionalResponse<ListSpaces200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListSpaces401", ListSpaces401>
      | WbdApiError<"ListSpaces500", ListSpaces500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListSpaces200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListSpaces401", ListSpaces401>
      | WbdApiError<"ListSpaces500", ListSpaces500>,
      R
    >;
  };
  /**
   * Create a space
   */
  readonly createSpace: {
    <Config extends OperationConfig | undefined = undefined>(options: {
      readonly payload: typeof CreateSpaceRequestJson.Encoded;
      readonly config: Config;
    }): Effect.Effect<
      WithOptionalResponse<CreateSpace201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateSpace400", CreateSpace400>
      | WbdApiError<"CreateSpace401", CreateSpace401>
      | WbdApiError<"CreateSpace500", CreateSpace500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(options: {
      readonly payload: typeof CreateSpaceRequestJson.Encoded;
      readonly config?: Config | undefined;
    }): Effect.Effect<
      WithOptionalResponse<CreateSpace201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateSpace400", CreateSpace400>
      | WbdApiError<"CreateSpace401", CreateSpace401>
      | WbdApiError<"CreateSpace500", CreateSpace500>,
      R
    >;
  };
  /**
   * Get a space
   */
  readonly getSpace: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetSpace200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetSpace400", GetSpace400>
      | WbdApiError<"GetSpace401", GetSpace401>
      | WbdApiError<"GetSpace403", GetSpace403>
      | WbdApiError<"GetSpace404", GetSpace404>
      | WbdApiError<"GetSpace500", GetSpace500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetSpace200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetSpace400", GetSpace400>
      | WbdApiError<"GetSpace401", GetSpace401>
      | WbdApiError<"GetSpace403", GetSpace403>
      | WbdApiError<"GetSpace404", GetSpace404>
      | WbdApiError<"GetSpace500", GetSpace500>,
      R
    >;
  };
  /**
   * Delete a space
   */
  readonly deleteSpace: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteSpace400", DeleteSpace400>
      | WbdApiError<"DeleteSpace401", DeleteSpace401>
      | WbdApiError<"DeleteSpace404", DeleteSpace404>
      | WbdApiError<"DeleteSpace500", DeleteSpace500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteSpace400", DeleteSpace400>
      | WbdApiError<"DeleteSpace401", DeleteSpace401>
      | WbdApiError<"DeleteSpace404", DeleteSpace404>
      | WbdApiError<"DeleteSpace500", DeleteSpace500>,
      R
    >;
  };
  /**
   * Update a space
   */
  readonly updateSpace: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof UpdateSpaceRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateSpace200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateSpace400", UpdateSpace400>
      | WbdApiError<"UpdateSpace401", UpdateSpace401>
      | WbdApiError<"UpdateSpace404", UpdateSpace404>
      | WbdApiError<"UpdateSpace500", UpdateSpace500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof UpdateSpaceRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateSpace200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateSpace400", UpdateSpace400>
      | WbdApiError<"UpdateSpace401", UpdateSpace401>
      | WbdApiError<"UpdateSpace404", UpdateSpace404>
      | WbdApiError<"UpdateSpace500", UpdateSpace500>,
      R
    >;
  };
  /**
   * Returns the projects in a space in their display order.
   */
  readonly listProjects: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ListProjects200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListProjects400", ListProjects400>
      | WbdApiError<"ListProjects401", ListProjects401>
      | WbdApiError<"ListProjects403", ListProjects403>
      | WbdApiError<"ListProjects404", ListProjects404>
      | WbdApiError<"ListProjects500", ListProjects500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListProjects200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListProjects400", ListProjects400>
      | WbdApiError<"ListProjects401", ListProjects401>
      | WbdApiError<"ListProjects403", ListProjects403>
      | WbdApiError<"ListProjects404", ListProjects404>
      | WbdApiError<"ListProjects500", ListProjects500>,
      R
    >;
  };
  /**
   * Create a project
   */
  readonly createProject: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof CreateProjectRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateProject201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateProject400", CreateProject400>
      | WbdApiError<"CreateProject401", CreateProject401>
      | WbdApiError<"CreateProject403", CreateProject403>
      | WbdApiError<"CreateProject409", CreateProject409>
      | WbdApiError<"CreateProject500", CreateProject500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof CreateProjectRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateProject201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateProject400", CreateProject400>
      | WbdApiError<"CreateProject401", CreateProject401>
      | WbdApiError<"CreateProject403", CreateProject403>
      | WbdApiError<"CreateProject409", CreateProject409>
      | WbdApiError<"CreateProject500", CreateProject500>,
      R
    >;
  };
  /**
   * Get a project
   */
  readonly getProject: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetProject200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetProject400", GetProject400>
      | WbdApiError<"GetProject401", GetProject401>
      | WbdApiError<"GetProject403", GetProject403>
      | WbdApiError<"GetProject404", GetProject404>
      | WbdApiError<"GetProject500", GetProject500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetProject200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetProject400", GetProject400>
      | WbdApiError<"GetProject401", GetProject401>
      | WbdApiError<"GetProject403", GetProject403>
      | WbdApiError<"GetProject404", GetProject404>
      | WbdApiError<"GetProject500", GetProject500>,
      R
    >;
  };
  /**
   * Delete a project
   */
  readonly deleteProject: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteProject400", DeleteProject400>
      | WbdApiError<"DeleteProject401", DeleteProject401>
      | WbdApiError<"DeleteProject403", DeleteProject403>
      | WbdApiError<"DeleteProject404", DeleteProject404>
      | WbdApiError<"DeleteProject409", DeleteProject409>
      | WbdApiError<"DeleteProject500", DeleteProject500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteProject400", DeleteProject400>
      | WbdApiError<"DeleteProject401", DeleteProject401>
      | WbdApiError<"DeleteProject403", DeleteProject403>
      | WbdApiError<"DeleteProject404", DeleteProject404>
      | WbdApiError<"DeleteProject409", DeleteProject409>
      | WbdApiError<"DeleteProject500", DeleteProject500>,
      R
    >;
  };
  /**
   * Update a project
   */
  readonly updateProject: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof UpdateProjectRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateProject200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateProject400", UpdateProject400>
      | WbdApiError<"UpdateProject401", UpdateProject401>
      | WbdApiError<"UpdateProject403", UpdateProject403>
      | WbdApiError<"UpdateProject404", UpdateProject404>
      | WbdApiError<"UpdateProject409", UpdateProject409>
      | WbdApiError<"UpdateProject500", UpdateProject500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof UpdateProjectRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateProject200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateProject400", UpdateProject400>
      | WbdApiError<"UpdateProject401", UpdateProject401>
      | WbdApiError<"UpdateProject403", UpdateProject403>
      | WbdApiError<"UpdateProject404", UpdateProject404>
      | WbdApiError<"UpdateProject409", UpdateProject409>
      | WbdApiError<"UpdateProject500", UpdateProject500>,
      R
    >;
  };
  /**
   * Move a project
   */
  readonly moveProject: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof MoveProjectRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveProject200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveProject400", MoveProject400>
      | WbdApiError<"MoveProject401", MoveProject401>
      | WbdApiError<"MoveProject403", MoveProject403>
      | WbdApiError<"MoveProject404", MoveProject404>
      | WbdApiError<"MoveProject409", MoveProject409>
      | WbdApiError<"MoveProject500", MoveProject500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof MoveProjectRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveProject200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveProject400", MoveProject400>
      | WbdApiError<"MoveProject401", MoveProject401>
      | WbdApiError<"MoveProject403", MoveProject403>
      | WbdApiError<"MoveProject404", MoveProject404>
      | WbdApiError<"MoveProject409", MoveProject409>
      | WbdApiError<"MoveProject500", MoveProject500>,
      R
    >;
  };
  /**
   * Returns a project's sections in display order.
   */
  readonly listProjectSections: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ListProjectSections200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListProjectSections400", ListProjectSections400>
      | WbdApiError<"ListProjectSections401", ListProjectSections401>
      | WbdApiError<"ListProjectSections403", ListProjectSections403>
      | WbdApiError<"ListProjectSections404", ListProjectSections404>
      | WbdApiError<"ListProjectSections500", ListProjectSections500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListProjectSections200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListProjectSections400", ListProjectSections400>
      | WbdApiError<"ListProjectSections401", ListProjectSections401>
      | WbdApiError<"ListProjectSections403", ListProjectSections403>
      | WbdApiError<"ListProjectSections404", ListProjectSections404>
      | WbdApiError<"ListProjectSections500", ListProjectSections500>,
      R
    >;
  };
  /**
   * Create a project section
   */
  readonly createProjectSection: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof CreateProjectSectionRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateProjectSection201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateProjectSection400", CreateProjectSection400>
      | WbdApiError<"CreateProjectSection401", CreateProjectSection401>
      | WbdApiError<"CreateProjectSection403", CreateProjectSection403>
      | WbdApiError<"CreateProjectSection404", CreateProjectSection404>
      | WbdApiError<"CreateProjectSection409", CreateProjectSection409>
      | WbdApiError<"CreateProjectSection500", CreateProjectSection500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      projectId: string,
      options: {
        readonly payload: typeof CreateProjectSectionRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateProjectSection201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateProjectSection400", CreateProjectSection400>
      | WbdApiError<"CreateProjectSection401", CreateProjectSection401>
      | WbdApiError<"CreateProjectSection403", CreateProjectSection403>
      | WbdApiError<"CreateProjectSection404", CreateProjectSection404>
      | WbdApiError<"CreateProjectSection409", CreateProjectSection409>
      | WbdApiError<"CreateProjectSection500", CreateProjectSection500>,
      R
    >;
  };
  /**
   * Get a project section
   */
  readonly getProjectSection: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetProjectSection200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetProjectSection400", GetProjectSection400>
      | WbdApiError<"GetProjectSection401", GetProjectSection401>
      | WbdApiError<"GetProjectSection403", GetProjectSection403>
      | WbdApiError<"GetProjectSection404", GetProjectSection404>
      | WbdApiError<"GetProjectSection500", GetProjectSection500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetProjectSection200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetProjectSection400", GetProjectSection400>
      | WbdApiError<"GetProjectSection401", GetProjectSection401>
      | WbdApiError<"GetProjectSection403", GetProjectSection403>
      | WbdApiError<"GetProjectSection404", GetProjectSection404>
      | WbdApiError<"GetProjectSection500", GetProjectSection500>,
      R
    >;
  };
  /**
   * Delete a project section
   */
  readonly deleteProjectSection: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteProjectSection400", DeleteProjectSection400>
      | WbdApiError<"DeleteProjectSection401", DeleteProjectSection401>
      | WbdApiError<"DeleteProjectSection403", DeleteProjectSection403>
      | WbdApiError<"DeleteProjectSection404", DeleteProjectSection404>
      | WbdApiError<"DeleteProjectSection409", DeleteProjectSection409>
      | WbdApiError<"DeleteProjectSection500", DeleteProjectSection500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteProjectSection400", DeleteProjectSection400>
      | WbdApiError<"DeleteProjectSection401", DeleteProjectSection401>
      | WbdApiError<"DeleteProjectSection403", DeleteProjectSection403>
      | WbdApiError<"DeleteProjectSection404", DeleteProjectSection404>
      | WbdApiError<"DeleteProjectSection409", DeleteProjectSection409>
      | WbdApiError<"DeleteProjectSection500", DeleteProjectSection500>,
      R
    >;
  };
  /**
   * Update a project section
   */
  readonly updateProjectSection: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof UpdateProjectSectionRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateProjectSection200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateProjectSection400", UpdateProjectSection400>
      | WbdApiError<"UpdateProjectSection401", UpdateProjectSection401>
      | WbdApiError<"UpdateProjectSection403", UpdateProjectSection403>
      | WbdApiError<"UpdateProjectSection404", UpdateProjectSection404>
      | WbdApiError<"UpdateProjectSection409", UpdateProjectSection409>
      | WbdApiError<"UpdateProjectSection500", UpdateProjectSection500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof UpdateProjectSectionRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateProjectSection200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateProjectSection400", UpdateProjectSection400>
      | WbdApiError<"UpdateProjectSection401", UpdateProjectSection401>
      | WbdApiError<"UpdateProjectSection403", UpdateProjectSection403>
      | WbdApiError<"UpdateProjectSection404", UpdateProjectSection404>
      | WbdApiError<"UpdateProjectSection409", UpdateProjectSection409>
      | WbdApiError<"UpdateProjectSection500", UpdateProjectSection500>,
      R
    >;
  };
  /**
   * Move a project section
   */
  readonly moveProjectSection: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof MoveProjectSectionRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveProjectSection200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveProjectSection400", MoveProjectSection400>
      | WbdApiError<"MoveProjectSection401", MoveProjectSection401>
      | WbdApiError<"MoveProjectSection403", MoveProjectSection403>
      | WbdApiError<"MoveProjectSection404", MoveProjectSection404>
      | WbdApiError<"MoveProjectSection409", MoveProjectSection409>
      | WbdApiError<"MoveProjectSection500", MoveProjectSection500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof MoveProjectSectionRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveProjectSection200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveProjectSection400", MoveProjectSection400>
      | WbdApiError<"MoveProjectSection401", MoveProjectSection401>
      | WbdApiError<"MoveProjectSection403", MoveProjectSection403>
      | WbdApiError<"MoveProjectSection404", MoveProjectSection404>
      | WbdApiError<"MoveProjectSection409", MoveProjectSection409>
      | WbdApiError<"MoveProjectSection500", MoveProjectSection500>,
      R
    >;
  };
  /**
   * Returns tasks ordered by creation time descending with opaque cursor pagination.
   */
  readonly listTasks: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params?: typeof ListTasksParams.Encoded | undefined;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListTasks200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListTasks400", ListTasks400>
      | WbdApiError<"ListTasks401", ListTasks401>
      | WbdApiError<"ListTasks403", ListTasks403>
      | WbdApiError<"ListTasks404", ListTasks404>
      | WbdApiError<"ListTasks500", ListTasks500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options:
        | {
            readonly params?: typeof ListTasksParams.Encoded | undefined;
            readonly config?: Config | undefined;
          }
        | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListTasks200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListTasks400", ListTasks400>
      | WbdApiError<"ListTasks401", ListTasks401>
      | WbdApiError<"ListTasks403", ListTasks403>
      | WbdApiError<"ListTasks404", ListTasks404>
      | WbdApiError<"ListTasks500", ListTasks500>,
      R
    >;
  };
  /**
   * Returns scheduled todo tasks ordered by schedule date. Overdue excludes relativeTo; upcoming includes it.
   */
  readonly listScheduledTasks: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params: typeof ListScheduledTasksParams.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListScheduledTasks200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListScheduledTasks400", ListScheduledTasks400>
      | WbdApiError<"ListScheduledTasks401", ListScheduledTasks401>
      | WbdApiError<"ListScheduledTasks403", ListScheduledTasks403>
      | WbdApiError<"ListScheduledTasks404", ListScheduledTasks404>
      | WbdApiError<"ListScheduledTasks500", ListScheduledTasks500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params: typeof ListScheduledTasksParams.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListScheduledTasks200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListScheduledTasks400", ListScheduledTasks400>
      | WbdApiError<"ListScheduledTasks401", ListScheduledTasks401>
      | WbdApiError<"ListScheduledTasks403", ListScheduledTasks403>
      | WbdApiError<"ListScheduledTasks404", ListScheduledTasks404>
      | WbdApiError<"ListScheduledTasks500", ListScheduledTasks500>,
      R
    >;
  };
  /**
   * Returns todo tasks and templates in display order by default. When taskState is done, returns completed tasks only.
   */
  readonly listSectionItems: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly params?: typeof ListSectionItemsParams.Encoded | undefined;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListSectionItems200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListSectionItems400", ListSectionItems400>
      | WbdApiError<"ListSectionItems401", ListSectionItems401>
      | WbdApiError<"ListSectionItems403", ListSectionItems403>
      | WbdApiError<"ListSectionItems404", ListSectionItems404>
      | WbdApiError<"ListSectionItems500", ListSectionItems500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options:
        | {
            readonly params?: typeof ListSectionItemsParams.Encoded | undefined;
            readonly config?: Config | undefined;
          }
        | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListSectionItems200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListSectionItems400", ListSectionItems400>
      | WbdApiError<"ListSectionItems401", ListSectionItems401>
      | WbdApiError<"ListSectionItems403", ListSectionItems403>
      | WbdApiError<"ListSectionItems404", ListSectionItems404>
      | WbdApiError<"ListSectionItems500", ListSectionItems500>,
      R
    >;
  };
  /**
   * Create a task
   */
  readonly createSectionTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof CreateSectionTaskRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateSectionTask201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateSectionTask400", CreateSectionTask400>
      | WbdApiError<"CreateSectionTask401", CreateSectionTask401>
      | WbdApiError<"CreateSectionTask403", CreateSectionTask403>
      | WbdApiError<"CreateSectionTask404", CreateSectionTask404>
      | WbdApiError<"CreateSectionTask409", CreateSectionTask409>
      | WbdApiError<"CreateSectionTask500", CreateSectionTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof CreateSectionTaskRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateSectionTask201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateSectionTask400", CreateSectionTask400>
      | WbdApiError<"CreateSectionTask401", CreateSectionTask401>
      | WbdApiError<"CreateSectionTask403", CreateSectionTask403>
      | WbdApiError<"CreateSectionTask404", CreateSectionTask404>
      | WbdApiError<"CreateSectionTask409", CreateSectionTask409>
      | WbdApiError<"CreateSectionTask500", CreateSectionTask500>,
      R
    >;
  };
  /**
   * Get a task
   */
  readonly getTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetTask400", GetTask400>
      | WbdApiError<"GetTask401", GetTask401>
      | WbdApiError<"GetTask403", GetTask403>
      | WbdApiError<"GetTask404", GetTask404>
      | WbdApiError<"GetTask500", GetTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetTask400", GetTask400>
      | WbdApiError<"GetTask401", GetTask401>
      | WbdApiError<"GetTask403", GetTask403>
      | WbdApiError<"GetTask404", GetTask404>
      | WbdApiError<"GetTask500", GetTask500>,
      R
    >;
  };
  /**
   * Moves the task to the trash, where it can be restored from the app for 30 days.
   */
  readonly deleteTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteTask400", DeleteTask400>
      | WbdApiError<"DeleteTask401", DeleteTask401>
      | WbdApiError<"DeleteTask403", DeleteTask403>
      | WbdApiError<"DeleteTask404", DeleteTask404>
      | WbdApiError<"DeleteTask500", DeleteTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteTask400", DeleteTask400>
      | WbdApiError<"DeleteTask401", DeleteTask401>
      | WbdApiError<"DeleteTask403", DeleteTask403>
      | WbdApiError<"DeleteTask404", DeleteTask404>
      | WbdApiError<"DeleteTask500", DeleteTask500>,
      R
    >;
  };
  /**
   * Update a task
   */
  readonly updateTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof UpdateTaskRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateTask400", UpdateTask400>
      | WbdApiError<"UpdateTask401", UpdateTask401>
      | WbdApiError<"UpdateTask403", UpdateTask403>
      | WbdApiError<"UpdateTask404", UpdateTask404>
      | WbdApiError<"UpdateTask409", UpdateTask409>
      | WbdApiError<"UpdateTask500", UpdateTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof UpdateTaskRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateTask400", UpdateTask400>
      | WbdApiError<"UpdateTask401", UpdateTask401>
      | WbdApiError<"UpdateTask403", UpdateTask403>
      | WbdApiError<"UpdateTask404", UpdateTask404>
      | WbdApiError<"UpdateTask409", UpdateTask409>
      | WbdApiError<"UpdateTask500", UpdateTask500>,
      R
    >;
  };
  /**
   * Schedules or reschedules a task on a date. Existing schedules are replaced.
   */
  readonly scheduleTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof ScheduleTaskRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ScheduleTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ScheduleTask400", ScheduleTask400>
      | WbdApiError<"ScheduleTask401", ScheduleTask401>
      | WbdApiError<"ScheduleTask403", ScheduleTask403>
      | WbdApiError<"ScheduleTask404", ScheduleTask404>
      | WbdApiError<"ScheduleTask409", ScheduleTask409>
      | WbdApiError<"ScheduleTask500", ScheduleTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof ScheduleTaskRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<ScheduleTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ScheduleTask400", ScheduleTask400>
      | WbdApiError<"ScheduleTask401", ScheduleTask401>
      | WbdApiError<"ScheduleTask403", ScheduleTask403>
      | WbdApiError<"ScheduleTask404", ScheduleTask404>
      | WbdApiError<"ScheduleTask409", ScheduleTask409>
      | WbdApiError<"ScheduleTask500", ScheduleTask500>,
      R
    >;
  };
  /**
   * Clear a task schedule
   */
  readonly clearTaskSchedule: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ClearTaskSchedule400", ClearTaskSchedule400>
      | WbdApiError<"ClearTaskSchedule401", ClearTaskSchedule401>
      | WbdApiError<"ClearTaskSchedule403", ClearTaskSchedule403>
      | WbdApiError<"ClearTaskSchedule404", ClearTaskSchedule404>
      | WbdApiError<"ClearTaskSchedule500", ClearTaskSchedule500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ClearTaskSchedule400", ClearTaskSchedule400>
      | WbdApiError<"ClearTaskSchedule401", ClearTaskSchedule401>
      | WbdApiError<"ClearTaskSchedule403", ClearTaskSchedule403>
      | WbdApiError<"ClearTaskSchedule404", ClearTaskSchedule404>
      | WbdApiError<"ClearTaskSchedule500", ClearTaskSchedule500>,
      R
    >;
  };
  /**
   * Move a task
   */
  readonly moveTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof MoveTaskRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveTask400", MoveTask400>
      | WbdApiError<"MoveTask401", MoveTask401>
      | WbdApiError<"MoveTask403", MoveTask403>
      | WbdApiError<"MoveTask404", MoveTask404>
      | WbdApiError<"MoveTask409", MoveTask409>
      | WbdApiError<"MoveTask500", MoveTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof MoveTaskRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveTask400", MoveTask400>
      | WbdApiError<"MoveTask401", MoveTask401>
      | WbdApiError<"MoveTask403", MoveTask403>
      | WbdApiError<"MoveTask404", MoveTask404>
      | WbdApiError<"MoveTask409", MoveTask409>
      | WbdApiError<"MoveTask500", MoveTask500>,
      R
    >;
  };
  /**
   * Returns existing daily lists in ascending date order. Empty dates are omitted.
   */
  readonly listDailyLists: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params: typeof ListDailyListsParams.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListDailyLists200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListDailyLists400", ListDailyLists400>
      | WbdApiError<"ListDailyLists401", ListDailyLists401>
      | WbdApiError<"ListDailyLists403", ListDailyLists403>
      | WbdApiError<"ListDailyLists404", ListDailyLists404>
      | WbdApiError<"ListDailyLists500", ListDailyLists500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params: typeof ListDailyListsParams.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListDailyLists200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListDailyLists400", ListDailyLists400>
      | WbdApiError<"ListDailyLists401", ListDailyLists401>
      | WbdApiError<"ListDailyLists403", ListDailyLists403>
      | WbdApiError<"ListDailyLists404", ListDailyLists404>
      | WbdApiError<"ListDailyLists500", ListDailyLists500>,
      R
    >;
  };
  /**
   * Returns scheduled todo tasks in daily-list order by default, or completed tasks ordered by most recently completed.
   */
  readonly listDailyListItems: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      date: string,
      options: {
        readonly params?: typeof ListDailyListItemsParams.Encoded | undefined;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListDailyListItems200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListDailyListItems400", ListDailyListItems400>
      | WbdApiError<"ListDailyListItems401", ListDailyListItems401>
      | WbdApiError<"ListDailyListItems403", ListDailyListItems403>
      | WbdApiError<"ListDailyListItems404", ListDailyListItems404>
      | WbdApiError<"ListDailyListItems500", ListDailyListItems500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      date: string,
      options:
        | {
            readonly params?:
              | typeof ListDailyListItemsParams.Encoded
              | undefined;
            readonly config?: Config | undefined;
          }
        | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListDailyListItems200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListDailyListItems400", ListDailyListItems400>
      | WbdApiError<"ListDailyListItems401", ListDailyListItems401>
      | WbdApiError<"ListDailyListItems403", ListDailyListItems403>
      | WbdApiError<"ListDailyListItems404", ListDailyListItems404>
      | WbdApiError<"ListDailyListItems500", ListDailyListItems500>,
      R
    >;
  };
  /**
   * Create a task template
   */
  readonly createTaskTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof CreateTaskTemplateRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateTaskTemplate201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateTaskTemplate400", CreateTaskTemplate400>
      | WbdApiError<"CreateTaskTemplate401", CreateTaskTemplate401>
      | WbdApiError<"CreateTaskTemplate403", CreateTaskTemplate403>
      | WbdApiError<"CreateTaskTemplate404", CreateTaskTemplate404>
      | WbdApiError<"CreateTaskTemplate409", CreateTaskTemplate409>
      | WbdApiError<"CreateTaskTemplate500", CreateTaskTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      sectionId: string,
      options: {
        readonly payload: typeof CreateTaskTemplateRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateTaskTemplate201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateTaskTemplate400", CreateTaskTemplate400>
      | WbdApiError<"CreateTaskTemplate401", CreateTaskTemplate401>
      | WbdApiError<"CreateTaskTemplate403", CreateTaskTemplate403>
      | WbdApiError<"CreateTaskTemplate404", CreateTaskTemplate404>
      | WbdApiError<"CreateTaskTemplate409", CreateTaskTemplate409>
      | WbdApiError<"CreateTaskTemplate500", CreateTaskTemplate500>,
      R
    >;
  };
  /**
   * Get a task template
   */
  readonly getTaskTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetTaskTemplate200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetTaskTemplate400", GetTaskTemplate400>
      | WbdApiError<"GetTaskTemplate401", GetTaskTemplate401>
      | WbdApiError<"GetTaskTemplate403", GetTaskTemplate403>
      | WbdApiError<"GetTaskTemplate404", GetTaskTemplate404>
      | WbdApiError<"GetTaskTemplate500", GetTaskTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetTaskTemplate200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetTaskTemplate400", GetTaskTemplate400>
      | WbdApiError<"GetTaskTemplate401", GetTaskTemplate401>
      | WbdApiError<"GetTaskTemplate403", GetTaskTemplate403>
      | WbdApiError<"GetTaskTemplate404", GetTaskTemplate404>
      | WbdApiError<"GetTaskTemplate500", GetTaskTemplate500>,
      R
    >;
  };
  /**
   * Delete a task template
   */
  readonly deleteTaskTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteTaskTemplate400", DeleteTaskTemplate400>
      | WbdApiError<"DeleteTaskTemplate401", DeleteTaskTemplate401>
      | WbdApiError<"DeleteTaskTemplate403", DeleteTaskTemplate403>
      | WbdApiError<"DeleteTaskTemplate404", DeleteTaskTemplate404>
      | WbdApiError<"DeleteTaskTemplate500", DeleteTaskTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteTaskTemplate400", DeleteTaskTemplate400>
      | WbdApiError<"DeleteTaskTemplate401", DeleteTaskTemplate401>
      | WbdApiError<"DeleteTaskTemplate403", DeleteTaskTemplate403>
      | WbdApiError<"DeleteTaskTemplate404", DeleteTaskTemplate404>
      | WbdApiError<"DeleteTaskTemplate500", DeleteTaskTemplate500>,
      R
    >;
  };
  /**
   * Update a task template
   */
  readonly updateTaskTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof UpdateTaskTemplateRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateTaskTemplate200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateTaskTemplate400", UpdateTaskTemplate400>
      | WbdApiError<"UpdateTaskTemplate401", UpdateTaskTemplate401>
      | WbdApiError<"UpdateTaskTemplate403", UpdateTaskTemplate403>
      | WbdApiError<"UpdateTaskTemplate404", UpdateTaskTemplate404>
      | WbdApiError<"UpdateTaskTemplate500", UpdateTaskTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof UpdateTaskTemplateRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateTaskTemplate200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateTaskTemplate400", UpdateTaskTemplate400>
      | WbdApiError<"UpdateTaskTemplate401", UpdateTaskTemplate401>
      | WbdApiError<"UpdateTaskTemplate403", UpdateTaskTemplate403>
      | WbdApiError<"UpdateTaskTemplate404", UpdateTaskTemplate404>
      | WbdApiError<"UpdateTaskTemplate500", UpdateTaskTemplate500>,
      R
    >;
  };
  /**
   * Move a task template
   */
  readonly moveTaskTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof MoveTaskTemplateRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveTaskTemplate200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveTaskTemplate400", MoveTaskTemplate400>
      | WbdApiError<"MoveTaskTemplate401", MoveTaskTemplate401>
      | WbdApiError<"MoveTaskTemplate403", MoveTaskTemplate403>
      | WbdApiError<"MoveTaskTemplate404", MoveTaskTemplate404>
      | WbdApiError<"MoveTaskTemplate409", MoveTaskTemplate409>
      | WbdApiError<"MoveTaskTemplate500", MoveTaskTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof MoveTaskTemplateRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveTaskTemplate200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveTaskTemplate400", MoveTaskTemplate400>
      | WbdApiError<"MoveTaskTemplate401", MoveTaskTemplate401>
      | WbdApiError<"MoveTaskTemplate403", MoveTaskTemplate403>
      | WbdApiError<"MoveTaskTemplate404", MoveTaskTemplate404>
      | WbdApiError<"MoveTaskTemplate409", MoveTaskTemplate409>
      | WbdApiError<"MoveTaskTemplate500", MoveTaskTemplate500>,
      R
    >;
  };
  /**
   * Convert a task to a recurring template
   */
  readonly convertTaskToTemplate: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof ConvertTaskToTemplateRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskToTemplate200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertTaskToTemplate400", ConvertTaskToTemplate400>
      | WbdApiError<"ConvertTaskToTemplate401", ConvertTaskToTemplate401>
      | WbdApiError<"ConvertTaskToTemplate403", ConvertTaskToTemplate403>
      | WbdApiError<"ConvertTaskToTemplate404", ConvertTaskToTemplate404>
      | WbdApiError<"ConvertTaskToTemplate500", ConvertTaskToTemplate500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof ConvertTaskToTemplateRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskToTemplate200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertTaskToTemplate400", ConvertTaskToTemplate400>
      | WbdApiError<"ConvertTaskToTemplate401", ConvertTaskToTemplate401>
      | WbdApiError<"ConvertTaskToTemplate403", ConvertTaskToTemplate403>
      | WbdApiError<"ConvertTaskToTemplate404", ConvertTaskToTemplate404>
      | WbdApiError<"ConvertTaskToTemplate500", ConvertTaskToTemplate500>,
      R
    >;
  };
  /**
   * Convert a task template to a task
   */
  readonly convertTaskTemplateToTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskTemplateToTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "ConvertTaskTemplateToTask400",
          ConvertTaskTemplateToTask400
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask401",
          ConvertTaskTemplateToTask401
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask403",
          ConvertTaskTemplateToTask403
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask404",
          ConvertTaskTemplateToTask404
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask500",
          ConvertTaskTemplateToTask500
        >,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskTemplateToTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "ConvertTaskTemplateToTask400",
          ConvertTaskTemplateToTask400
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask401",
          ConvertTaskTemplateToTask401
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask403",
          ConvertTaskTemplateToTask403
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask404",
          ConvertTaskTemplateToTask404
        >
      | WbdApiError<
          "ConvertTaskTemplateToTask500",
          ConvertTaskTemplateToTask500
        >,
      R
    >;
  };
  /**
   * Get a note
   */
  readonly getNote: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetNote200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetNote400", GetNote400>
      | WbdApiError<"GetNote401", GetNote401>
      | WbdApiError<"GetNote403", GetNote403>
      | WbdApiError<"GetNote404", GetNote404>
      | WbdApiError<"GetNote500", GetNote500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetNote200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetNote400", GetNote400>
      | WbdApiError<"GetNote401", GetNote401>
      | WbdApiError<"GetNote403", GetNote403>
      | WbdApiError<"GetNote404", GetNote404>
      | WbdApiError<"GetNote500", GetNote500>,
      R
    >;
  };
  /**
   * Delete a note
   */
  readonly deleteNote: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteNote400", DeleteNote400>
      | WbdApiError<"DeleteNote401", DeleteNote401>
      | WbdApiError<"DeleteNote403", DeleteNote403>
      | WbdApiError<"DeleteNote404", DeleteNote404>
      | WbdApiError<"DeleteNote500", DeleteNote500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteNote400", DeleteNote400>
      | WbdApiError<"DeleteNote401", DeleteNote401>
      | WbdApiError<"DeleteNote403", DeleteNote403>
      | WbdApiError<"DeleteNote404", DeleteNote404>
      | WbdApiError<"DeleteNote500", DeleteNote500>,
      R
    >;
  };
  /**
   * Update a note
   */
  readonly updateNote: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: {
        readonly payload: typeof UpdateNoteRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateNote200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateNote400", UpdateNote400>
      | WbdApiError<"UpdateNote401", UpdateNote401>
      | WbdApiError<"UpdateNote403", UpdateNote403>
      | WbdApiError<"UpdateNote404", UpdateNote404>
      | WbdApiError<"UpdateNote500", UpdateNote500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: {
        readonly payload: typeof UpdateNoteRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateNote200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateNote400", UpdateNote400>
      | WbdApiError<"UpdateNote401", UpdateNote401>
      | WbdApiError<"UpdateNote403", UpdateNote403>
      | WbdApiError<"UpdateNote404", UpdateNote404>
      | WbdApiError<"UpdateNote500", UpdateNote500>,
      R
    >;
  };
  /**
   * Move a note
   */
  readonly moveNote: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: {
        readonly payload: typeof MoveNoteRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveNote200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveNote400", MoveNote400>
      | WbdApiError<"MoveNote401", MoveNote401>
      | WbdApiError<"MoveNote403", MoveNote403>
      | WbdApiError<"MoveNote404", MoveNote404>
      | WbdApiError<"MoveNote409", MoveNote409>
      | WbdApiError<"MoveNote500", MoveNote500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: {
        readonly payload: typeof MoveNoteRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveNote200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveNote400", MoveNote400>
      | WbdApiError<"MoveNote401", MoveNote401>
      | WbdApiError<"MoveNote403", MoveNote403>
      | WbdApiError<"MoveNote404", MoveNote404>
      | WbdApiError<"MoveNote409", MoveNote409>
      | WbdApiError<"MoveNote500", MoveNote500>,
      R
    >;
  };
  /**
   * Convert a task to a note
   */
  readonly convertTaskToNote: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskToNote200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertTaskToNote400", ConvertTaskToNote400>
      | WbdApiError<"ConvertTaskToNote401", ConvertTaskToNote401>
      | WbdApiError<"ConvertTaskToNote403", ConvertTaskToNote403>
      | WbdApiError<"ConvertTaskToNote404", ConvertTaskToNote404>
      | WbdApiError<"ConvertTaskToNote500", ConvertTaskToNote500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ConvertTaskToNote200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertTaskToNote400", ConvertTaskToNote400>
      | WbdApiError<"ConvertTaskToNote401", ConvertTaskToNote401>
      | WbdApiError<"ConvertTaskToNote403", ConvertTaskToNote403>
      | WbdApiError<"ConvertTaskToNote404", ConvertTaskToNote404>
      | WbdApiError<"ConvertTaskToNote500", ConvertTaskToNote500>,
      R
    >;
  };
  /**
   * Convert a note to a task
   */
  readonly convertNoteToTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ConvertNoteToTask200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertNoteToTask400", ConvertNoteToTask400>
      | WbdApiError<"ConvertNoteToTask401", ConvertNoteToTask401>
      | WbdApiError<"ConvertNoteToTask403", ConvertNoteToTask403>
      | WbdApiError<"ConvertNoteToTask404", ConvertNoteToTask404>
      | WbdApiError<"ConvertNoteToTask500", ConvertNoteToTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      noteId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ConvertNoteToTask200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ConvertNoteToTask400", ConvertNoteToTask400>
      | WbdApiError<"ConvertNoteToTask401", ConvertNoteToTask401>
      | WbdApiError<"ConvertNoteToTask403", ConvertNoteToTask403>
      | WbdApiError<"ConvertNoteToTask404", ConvertNoteToTask404>
      | WbdApiError<"ConvertNoteToTask500", ConvertNoteToTask500>,
      R
    >;
  };
  /**
   * List a task's checklist items
   */
  readonly listTaskChecklistItems: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ListTaskChecklistItems200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListTaskChecklistItems400", ListTaskChecklistItems400>
      | WbdApiError<"ListTaskChecklistItems401", ListTaskChecklistItems401>
      | WbdApiError<"ListTaskChecklistItems403", ListTaskChecklistItems403>
      | WbdApiError<"ListTaskChecklistItems404", ListTaskChecklistItems404>
      | WbdApiError<"ListTaskChecklistItems500", ListTaskChecklistItems500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListTaskChecklistItems200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListTaskChecklistItems400", ListTaskChecklistItems400>
      | WbdApiError<"ListTaskChecklistItems401", ListTaskChecklistItems401>
      | WbdApiError<"ListTaskChecklistItems403", ListTaskChecklistItems403>
      | WbdApiError<"ListTaskChecklistItems404", ListTaskChecklistItems404>
      | WbdApiError<"ListTaskChecklistItems500", ListTaskChecklistItems500>,
      R
    >;
  };
  /**
   * Create a checklist item for a task
   */
  readonly createTaskChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof CreateTaskChecklistItemRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateTaskChecklistItem201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateTaskChecklistItem400", CreateTaskChecklistItem400>
      | WbdApiError<"CreateTaskChecklistItem401", CreateTaskChecklistItem401>
      | WbdApiError<"CreateTaskChecklistItem403", CreateTaskChecklistItem403>
      | WbdApiError<"CreateTaskChecklistItem404", CreateTaskChecklistItem404>
      | WbdApiError<"CreateTaskChecklistItem409", CreateTaskChecklistItem409>
      | WbdApiError<"CreateTaskChecklistItem500", CreateTaskChecklistItem500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof CreateTaskChecklistItemRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateTaskChecklistItem201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateTaskChecklistItem400", CreateTaskChecklistItem400>
      | WbdApiError<"CreateTaskChecklistItem401", CreateTaskChecklistItem401>
      | WbdApiError<"CreateTaskChecklistItem403", CreateTaskChecklistItem403>
      | WbdApiError<"CreateTaskChecklistItem404", CreateTaskChecklistItem404>
      | WbdApiError<"CreateTaskChecklistItem409", CreateTaskChecklistItem409>
      | WbdApiError<"CreateTaskChecklistItem500", CreateTaskChecklistItem500>,
      R
    >;
  };
  /**
   * List a task template's checklist items
   */
  readonly listTaskTemplateChecklistItems: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<ListTaskTemplateChecklistItems200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "ListTaskTemplateChecklistItems400",
          ListTaskTemplateChecklistItems400
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems401",
          ListTaskTemplateChecklistItems401
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems403",
          ListTaskTemplateChecklistItems403
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems404",
          ListTaskTemplateChecklistItems404
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems500",
          ListTaskTemplateChecklistItems500
        >,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<
        ListTaskTemplateChecklistItems200,
        Config | undefined
      >,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "ListTaskTemplateChecklistItems400",
          ListTaskTemplateChecklistItems400
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems401",
          ListTaskTemplateChecklistItems401
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems403",
          ListTaskTemplateChecklistItems403
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems404",
          ListTaskTemplateChecklistItems404
        >
      | WbdApiError<
          "ListTaskTemplateChecklistItems500",
          ListTaskTemplateChecklistItems500
        >,
      R
    >;
  };
  /**
   * Create a checklist item for a task template
   */
  readonly createTaskTemplateChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof CreateTaskTemplateChecklistItemRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateTaskTemplateChecklistItem201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "CreateTaskTemplateChecklistItem400",
          CreateTaskTemplateChecklistItem400
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem401",
          CreateTaskTemplateChecklistItem401
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem403",
          CreateTaskTemplateChecklistItem403
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem404",
          CreateTaskTemplateChecklistItem404
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem409",
          CreateTaskTemplateChecklistItem409
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem500",
          CreateTaskTemplateChecklistItem500
        >,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      templateId: string,
      options: {
        readonly payload: typeof CreateTaskTemplateChecklistItemRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<
        CreateTaskTemplateChecklistItem201,
        Config | undefined
      >,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<
          "CreateTaskTemplateChecklistItem400",
          CreateTaskTemplateChecklistItem400
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem401",
          CreateTaskTemplateChecklistItem401
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem403",
          CreateTaskTemplateChecklistItem403
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem404",
          CreateTaskTemplateChecklistItem404
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem409",
          CreateTaskTemplateChecklistItem409
        >
      | WbdApiError<
          "CreateTaskTemplateChecklistItem500",
          CreateTaskTemplateChecklistItem500
        >,
      R
    >;
  };
  /**
   * Get a checklist item
   */
  readonly getChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<GetChecklistItem200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetChecklistItem400", GetChecklistItem400>
      | WbdApiError<"GetChecklistItem401", GetChecklistItem401>
      | WbdApiError<"GetChecklistItem403", GetChecklistItem403>
      | WbdApiError<"GetChecklistItem404", GetChecklistItem404>
      | WbdApiError<"GetChecklistItem500", GetChecklistItem500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<GetChecklistItem200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"GetChecklistItem400", GetChecklistItem400>
      | WbdApiError<"GetChecklistItem401", GetChecklistItem401>
      | WbdApiError<"GetChecklistItem403", GetChecklistItem403>
      | WbdApiError<"GetChecklistItem404", GetChecklistItem404>
      | WbdApiError<"GetChecklistItem500", GetChecklistItem500>,
      R
    >;
  };
  /**
   * Delete a checklist item
   */
  readonly deleteChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteChecklistItem400", DeleteChecklistItem400>
      | WbdApiError<"DeleteChecklistItem401", DeleteChecklistItem401>
      | WbdApiError<"DeleteChecklistItem403", DeleteChecklistItem403>
      | WbdApiError<"DeleteChecklistItem404", DeleteChecklistItem404>
      | WbdApiError<"DeleteChecklistItem500", DeleteChecklistItem500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"DeleteChecklistItem400", DeleteChecklistItem400>
      | WbdApiError<"DeleteChecklistItem401", DeleteChecklistItem401>
      | WbdApiError<"DeleteChecklistItem403", DeleteChecklistItem403>
      | WbdApiError<"DeleteChecklistItem404", DeleteChecklistItem404>
      | WbdApiError<"DeleteChecklistItem500", DeleteChecklistItem500>,
      R
    >;
  };
  /**
   * Update a checklist item
   */
  readonly updateChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: {
        readonly payload: typeof UpdateChecklistItemRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateChecklistItem200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateChecklistItem400", UpdateChecklistItem400>
      | WbdApiError<"UpdateChecklistItem401", UpdateChecklistItem401>
      | WbdApiError<"UpdateChecklistItem403", UpdateChecklistItem403>
      | WbdApiError<"UpdateChecklistItem404", UpdateChecklistItem404>
      | WbdApiError<"UpdateChecklistItem500", UpdateChecklistItem500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: {
        readonly payload: typeof UpdateChecklistItemRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<UpdateChecklistItem200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"UpdateChecklistItem400", UpdateChecklistItem400>
      | WbdApiError<"UpdateChecklistItem401", UpdateChecklistItem401>
      | WbdApiError<"UpdateChecklistItem403", UpdateChecklistItem403>
      | WbdApiError<"UpdateChecklistItem404", UpdateChecklistItem404>
      | WbdApiError<"UpdateChecklistItem500", UpdateChecklistItem500>,
      R
    >;
  };
  /**
   * Move a checklist item
   */
  readonly moveChecklistItem: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: {
        readonly payload: typeof MoveChecklistItemRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveChecklistItem200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveChecklistItem400", MoveChecklistItem400>
      | WbdApiError<"MoveChecklistItem401", MoveChecklistItem401>
      | WbdApiError<"MoveChecklistItem403", MoveChecklistItem403>
      | WbdApiError<"MoveChecklistItem404", MoveChecklistItem404>
      | WbdApiError<"MoveChecklistItem409", MoveChecklistItem409>
      | WbdApiError<"MoveChecklistItem500", MoveChecklistItem500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      checklistItemId: string,
      options: {
        readonly payload: typeof MoveChecklistItemRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<MoveChecklistItem200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"MoveChecklistItem400", MoveChecklistItem400>
      | WbdApiError<"MoveChecklistItem401", MoveChecklistItem401>
      | WbdApiError<"MoveChecklistItem403", MoveChecklistItem403>
      | WbdApiError<"MoveChecklistItem404", MoveChecklistItem404>
      | WbdApiError<"MoveChecklistItem409", MoveChecklistItem409>
      | WbdApiError<"MoveChecklistItem500", MoveChecklistItem500>,
      R
    >;
  };
  /**
   * Returns todo tasks in stash order by default. Completed tasks are ordered by most recent completion.
   */
  readonly listStashTasks: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly params?: typeof ListStashTasksParams.Encoded | undefined;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<ListStashTasks200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListStashTasks400", ListStashTasks400>
      | WbdApiError<"ListStashTasks401", ListStashTasks401>
      | WbdApiError<"ListStashTasks403", ListStashTasks403>
      | WbdApiError<"ListStashTasks404", ListStashTasks404>
      | WbdApiError<"ListStashTasks500", ListStashTasks500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options:
        | {
            readonly params?: typeof ListStashTasksParams.Encoded | undefined;
            readonly config?: Config | undefined;
          }
        | undefined,
    ): Effect.Effect<
      WithOptionalResponse<ListStashTasks200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"ListStashTasks400", ListStashTasks400>
      | WbdApiError<"ListStashTasks401", ListStashTasks401>
      | WbdApiError<"ListStashTasks403", ListStashTasks403>
      | WbdApiError<"ListStashTasks404", ListStashTasks404>
      | WbdApiError<"ListStashTasks500", ListStashTasks500>,
      R
    >;
  };
  /**
   * Creates the underlying task in the inbox and adds it to the stash.
   */
  readonly createStashTask: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof CreateStashTaskRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateStashTask201, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateStashTask400", CreateStashTask400>
      | WbdApiError<"CreateStashTask401", CreateStashTask401>
      | WbdApiError<"CreateStashTask403", CreateStashTask403>
      | WbdApiError<"CreateStashTask404", CreateStashTask404>
      | WbdApiError<"CreateStashTask409", CreateStashTask409>
      | WbdApiError<"CreateStashTask500", CreateStashTask500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      options: {
        readonly payload: typeof CreateStashTaskRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<CreateStashTask201, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"CreateStashTask400", CreateStashTask400>
      | WbdApiError<"CreateStashTask401", CreateStashTask401>
      | WbdApiError<"CreateStashTask403", CreateStashTask403>
      | WbdApiError<"CreateStashTask404", CreateStashTask404>
      | WbdApiError<"CreateStashTask409", CreateStashTask409>
      | WbdApiError<"CreateStashTask500", CreateStashTask500>,
      R
    >;
  };
  /**
   * Adds an existing todo task to the stash or changes its stash position. The task schedule is preserved.
   */
  readonly putTaskInStash: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof PutTaskInStashRequestJson.Encoded;
        readonly config: Config;
      },
    ): Effect.Effect<
      WithOptionalResponse<PutTaskInStash200, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"PutTaskInStash400", PutTaskInStash400>
      | WbdApiError<"PutTaskInStash401", PutTaskInStash401>
      | WbdApiError<"PutTaskInStash403", PutTaskInStash403>
      | WbdApiError<"PutTaskInStash404", PutTaskInStash404>
      | WbdApiError<"PutTaskInStash409", PutTaskInStash409>
      | WbdApiError<"PutTaskInStash500", PutTaskInStash500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: {
        readonly payload: typeof PutTaskInStashRequestJson.Encoded;
        readonly config?: Config | undefined;
      },
    ): Effect.Effect<
      WithOptionalResponse<PutTaskInStash200, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"PutTaskInStash400", PutTaskInStash400>
      | WbdApiError<"PutTaskInStash401", PutTaskInStash401>
      | WbdApiError<"PutTaskInStash403", PutTaskInStash403>
      | WbdApiError<"PutTaskInStash404", PutTaskInStash404>
      | WbdApiError<"PutTaskInStash409", PutTaskInStash409>
      | WbdApiError<"PutTaskInStash500", PutTaskInStash500>,
      R
    >;
  };
  /**
   * Removes the stash membership without deleting the underlying task.
   */
  readonly removeTaskFromStash: {
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config: Config },
    ): Effect.Effect<
      WithOptionalResponse<void, Config>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"RemoveTaskFromStash400", RemoveTaskFromStash400>
      | WbdApiError<"RemoveTaskFromStash401", RemoveTaskFromStash401>
      | WbdApiError<"RemoveTaskFromStash403", RemoveTaskFromStash403>
      | WbdApiError<"RemoveTaskFromStash404", RemoveTaskFromStash404>
      | WbdApiError<"RemoveTaskFromStash500", RemoveTaskFromStash500>,
      R
    >;
    <Config extends OperationConfig | undefined = undefined>(
      spaceId: string,
      taskId: string,
      options: { readonly config?: Config | undefined } | undefined,
    ): Effect.Effect<
      WithOptionalResponse<void, Config | undefined>,
      | E
      | HttpClientError.HttpClientError
      | SchemaError
      | WbdApiError<"RemoveTaskFromStash400", RemoveTaskFromStash400>
      | WbdApiError<"RemoveTaskFromStash401", RemoveTaskFromStash401>
      | WbdApiError<"RemoveTaskFromStash403", RemoveTaskFromStash403>
      | WbdApiError<"RemoveTaskFromStash404", RemoveTaskFromStash404>
      | WbdApiError<"RemoveTaskFromStash500", RemoveTaskFromStash500>,
      R
    >;
  };
}

export interface WbdApiError<Tag extends string, E> {
  readonly _tag: Tag;
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly cause: E;
}

class WbdApiErrorImpl extends Data.Error<{
  _tag: string;
  cause: any;
  request: HttpClientRequest.HttpClientRequest;
  response: HttpClientResponse.HttpClientResponse;
}> {}

export const WbdApiError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): WbdApiError<Tag, E> =>
  new WbdApiErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any;
