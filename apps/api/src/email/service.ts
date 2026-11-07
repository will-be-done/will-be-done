import { randomUUID } from "node:crypto";
import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import { Clock, Effect, Result, Schedule, Schema } from "effect";
import { Resend } from "resend";
import { dispatch } from "../services/hyperdb";
import { getUserById, normalizeEmail } from "../slices/authSlice";
import {
  claimEmailJob,
  cleanEmailJobs,
  consumeEmailChallenge,
  finishEmailJob,
  hashEmailToken,
  registerWithEmail,
  requestReset,
  requestVerification,
  requestEmailChange,
  requireEmailChallenge,
} from "./actions";
import type { EmailConfig, EmailTemplateConfig } from "./config";
import type { EmailPayload } from "./templates";

export interface EmailSender {
  send(
    payload: EmailPayload,
    idempotencyKey: string,
  ): Effect.Effect<string, EmailDeliveryError>;
}

export class EmailDeliveryError extends Schema.TaggedError<EmailDeliveryError>()(
  "EmailDeliveryError",
  {
    code: Schema.String,
    retryable: Schema.Boolean,
    retryAfterMs: Schema.optional(Schema.Number),
  },
) {}

const SEND_TIMEOUT = "10 seconds";

const timedOut = () =>
  Effect.fail(new EmailDeliveryError({ code: "timeout", retryable: true }));

const retryAfterMs = (retryAfter: string, now: number) => {
  const ms = /^\d+(\.\d+)?$/.test(retryAfter)
    ? Number(retryAfter) * 1000
    : Math.max(0, Date.parse(retryAfter) - now);
  return Number.isFinite(ms) ? ms : undefined;
};

export function createResendSender(
  apiKey: string,
  options?: { baseUrl?: string },
): EmailSender {
  const resend = new Resend(apiKey, options);
  return {
    send: Effect.fn("Resend.send")(
      function* (payload: EmailPayload, idempotencyKey: string) {
        const result = yield* Effect.tryPromise({
          try: (signal) =>
            resend.emails.send(payload, { idempotencyKey, signal }),
          catch: () =>
            new EmailDeliveryError({ code: "network_error", retryable: true }),
        });
        if (result.error) {
          const status = result.error.statusCode;
          const retryAfter = result.headers?.["retry-after"];
          return yield* new EmailDeliveryError({
            code: result.error.name,
            retryable:
              status === 429 ||
              (status != null && status >= 500) ||
              result.error.name === "concurrent_idempotent_requests" ||
              result.error.name === "rate_limit_exceeded" ||
              result.error.name === "internal_server_error" ||
              (status == null && result.error.name === "application_error"),
            retryAfterMs: retryAfter
              ? retryAfterMs(retryAfter, yield* Clock.currentTimeMillis)
              : undefined,
          });
        }
        if (!result.data?.id) {
          return yield* new EmailDeliveryError({
            code: "missing_provider_id",
            retryable: true,
          });
        }
        return result.data.id;
      },
      Effect.timeoutOrElse({ duration: SEND_TIMEOUT, orElse: timedOut }),
    ),
  };
}

export interface AccountEmailService {
  readonly enabled: boolean;
  register(
    email: string,
    hashedPassword: string,
  ): Promise<{ userId: string; token: string }>;
  requestVerification(
    userId: string,
  ): Promise<{ queued: boolean; retryAfterSeconds: number }>;
  requestReset(email: string): Promise<{ success: true }>;
  verify(token: string): Promise<{ success: true; userId: string }>;
  changeEmail(
    actor: { userId: string; tokenId: string },
    email: string,
    password?: string,
  ): Promise<{ changed: boolean; queued: boolean; retryAfterSeconds: number }>;
  confirmEmailChange(token: string): Promise<{ success: true; userId: string }>;
  reset(
    token: string,
    password: string,
  ): Promise<{ success: true; userId: string }>;
}

export async function changeAccountEmail(
  db: DB,
  actor: { userId: string; tokenId: string },
  email: string,
  password?: string,
  config?: EmailTemplateConfig,
) {
  const user = await selectAsync(db, {
    selector: getUserById,
    args: { id: actor.userId },
  });
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (
    !user.emailVerifiedAt &&
    (!user.password ||
      !password ||
      !(await Bun.password.verify(password, user.password)))
  )
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid password." });
  // Recheck the session and password atomically after asynchronous verification.
  return asyncDispatch(
    db,
    requestEmailChange({
      ...actor,
      email: normalizeEmail(email),
      expectedPassword: user.emailVerifiedAt ? undefined : user.password,
      config,
      now: Date.now(),
    }),
  );
}

export function createAccountEmailService(
  db: DB,
  settings: EmailConfig,
): AccountEmailService {
  const config = { from: settings.from, appUrl: settings.appUrl };
  return {
    enabled: true,
    changeEmail: (actor, email, password) =>
      changeAccountEmail(db, actor, email, password, config),
    confirmEmailChange: (token) =>
      asyncDispatch(
        db,
        consumeEmailChallenge({
          tokenHash: hashEmailToken(token),
          purpose: "emailChange",
          config,
          now: Date.now(),
        }),
      ),
    register: (email, hashedPassword) =>
      asyncDispatch(
        db,
        registerWithEmail({ email, hashedPassword, config, now: Date.now() }),
      ),
    requestVerification: (userId) =>
      asyncDispatch(
        db,
        requestVerification({ userId, config, now: Date.now() }),
      ),
    requestReset: (email) =>
      asyncDispatch(db, requestReset({ email, config, now: Date.now() })),
    verify: (token) =>
      asyncDispatch(
        db,
        consumeEmailChallenge({
          tokenHash: hashEmailToken(token),
          purpose: "verification",
          config,
          now: Date.now(),
        }),
      ),
    async reset(token, password) {
      const tokenHash = hashEmailToken(token);
      await selectAsync(db, {
        selector: requireEmailChallenge,
        args: { tokenHash, purpose: "passwordReset", now: Date.now() },
      });
      const hashedPassword = await Bun.password.hash(password);
      // Recheck and consume atomically: the link may change while hashing.
      return asyncDispatch(
        db,
        consumeEmailChallenge({
          tokenHash,
          purpose: "passwordReset",
          hashedPassword,
          config,
          now: Date.now(),
        }),
      );
    },
  };
}

export function requireAccountEmail(
  service?: AccountEmailService,
): AccountEmailService {
  if (!service?.enabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Email is not configured on this server.",
    });
  return service;
}

export type EmailWorkerLog = (event: {
  jobId?: string;
  kind?: string;
  status: string;
  code?: string;
}) => void;

const logToConsole: EmailWorkerLog = (event) =>
  console.log("[Account email]", event);

// Each job runs to completion: interrupting the worker stops it between jobs,
// so a sent email is always recorded.
const deliverEmailJob = Effect.fn("deliverEmailJob")(function* (
  db: DB,
  sender: EmailSender,
  log: EmailWorkerLog,
) {
  const leaseId = randomUUID();
  const job = yield* dispatch(
    db,
    claimEmailJob({ now: yield* Clock.currentTimeMillis, leaseId }),
  );
  if (!job) return false;
  if (job.status !== "pending") {
    log({
      jobId: job.id,
      kind: job.kind,
      status: job.status,
      ...(job.failureCode ? { code: job.failureCode } : {}),
    });
    return true;
  }
  const result = yield* Effect.try(
    () => JSON.parse(job.payload!) as EmailPayload,
  ).pipe(
    Effect.flatMap((payload) =>
      sender
        .send(payload, `account-email/${job.id}`)
        .pipe(
          Effect.interruptible,
          Effect.timeoutOrElse({ duration: SEND_TIMEOUT, orElse: timedOut }),
        ),
    ),
    Effect.result,
  );
  const now = yield* Clock.currentTimeMillis;
  let providerId: string | undefined;
  let failureCode: string | undefined;
  let retryAt: number | undefined;
  if (Result.isSuccess(result)) providerId = result.success;
  else {
    // Provider errors can contain credentials and bodies; log only safe codes.
    const error = result.failure;
    const known = error instanceof EmailDeliveryError;
    failureCode = known ? error.code : "network_error";
    if (!known || error.retryable) {
      const backoff =
        [30_000, 120_000, 600_000, 1_800_000][job.attempts - 1] ?? 3_600_000;
      retryAt = now + Math.max(backoff, known ? (error.retryAfterMs ?? 0) : 0);
    }
  }
  yield* dispatch(
    db,
    finishEmailJob({
      id: job.id,
      leaseId,
      now: yield* Clock.currentTimeMillis,
      providerId,
      failureCode,
      retryAt,
    }),
  );
  log({
    jobId: job.id,
    kind: job.kind,
    status: providerId
      ? "sent"
      : retryAt !== undefined && retryAt < job.deadline
        ? "retry"
        : "failed",
    ...(failureCode ? { code: failureCode } : {}),
  });
  return true;
}, Effect.uninterruptible);

export const drainEmailJobs = Effect.fn("drainEmailJobs")(function* (
  db: DB,
  sender: EmailSender,
  {
    paceMs = 500,
    log = logToConsole,
  }: { paceMs?: number; log?: EmailWorkerLog } = {},
) {
  yield* dispatch(db, cleanEmailJobs({ now: yield* Clock.currentTimeMillis }));
  for (let count = 0; count < 20; count++) {
    if (!(yield* deliverEmailJob(db, sender, log))) break;
    if (paceMs > 0) yield* Effect.sleep(paceMs);
  }
});

export const runEmailWorker = (
  db: DB,
  sender: EmailSender,
  log: EmailWorkerLog = logToConsole,
) =>
  drainEmailJobs(db, sender, { log }).pipe(
    Effect.catchCause(() =>
      Effect.sync(() =>
        log({ status: "worker_error", code: "database_error" }),
      ),
    ),
    Effect.repeat(Schedule.spaced("5 seconds")),
  );
