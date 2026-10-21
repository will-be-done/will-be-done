import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { asyncDispatch, type DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import {
  claimEmailJob,
  cleanEmailJobs,
  consumeEmailChallenge,
  finishEmailJob,
  hashEmailToken,
  registerWithEmail,
  requestReset,
  requestVerification,
} from "./actions";
import type { EmailConfig } from "./config";
import type { EmailPayload } from "./templates";

export interface EmailSender {
  send(payload: EmailPayload, idempotencyKey: string): Promise<string>;
}

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}

export function createResendSender(
  apiKey: string,
  options?: { baseUrl?: string },
): EmailSender {
  const resend = new Resend(apiKey, options);
  return {
    async send(payload, idempotencyKey) {
      const result = await resend.emails.send(payload, {
        idempotencyKey,
        signal: AbortSignal.timeout(10_000),
      });
      if (result.error) {
        const status = result.error.statusCode;
        const retryAfter = result.headers?.["retry-after"];
        const retryAfterMs = retryAfter
          ? /^\d+(\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now())
          : undefined;
        throw new EmailDeliveryError(
          result.error.name,
          status === 429 ||
            (status != null && status >= 500) ||
            result.error.name === "concurrent_idempotent_requests" ||
            result.error.name === "rate_limit_exceeded" ||
            result.error.name === "internal_server_error" ||
            (status == null && result.error.name === "application_error"),
          Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
        );
      }
      if (!result.data?.id)
        throw new EmailDeliveryError("missing_provider_id", true);
      return result.data.id;
    },
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
  reset(
    token: string,
    password: string,
  ): Promise<{ success: true; userId: string }>;
}

export function createAccountEmailService(
  db: DB,
  settings: EmailConfig,
): AccountEmailService {
  const config = { from: settings.from, appUrl: settings.appUrl };
  return {
    enabled: true,
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
      // Consume the challenge and update credentials in one transaction after hashing.
      const hashedPassword = await Bun.password.hash(password);
      return asyncDispatch(
        db,
        consumeEmailChallenge({
          tokenHash: hashEmailToken(token),
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

interface WorkerOptions {
  now?: () => number;
  paceMs?: number;
  log?: (event: {
    jobId?: string;
    kind?: string;
    status: string;
    code?: string;
  }) => void;
}

export function createEmailWorker(
  db: DB,
  sender: EmailSender,
  {
    now = Date.now,
    paceMs = 500,
    log = (event) => console.log("[Account email]", event),
  }: WorkerOptions = {},
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;

  async function drain() {
    await asyncDispatch(db, cleanEmailJobs({ now: now() }));
    for (let count = 0; count < 20 && !stopped; count++) {
      const leaseId = randomUUID();
      const job = await asyncDispatch(
        db,
        claimEmailJob({ now: now(), leaseId }),
      );
      if (!job) break;
      if (job.status !== "pending") {
        log({
          jobId: job.id,
          kind: job.kind,
          status: job.status,
          ...(job.failureCode ? { code: job.failureCode } : {}),
        });
        continue;
      }
      let providerId: string | undefined;
      let failureCode: string | undefined;
      let retryAt: number | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const payload = JSON.parse(job.payload!) as EmailPayload;
        providerId = await Promise.race([
          sender.send(payload, `account-email/${job.id}`),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new EmailDeliveryError("timeout", true)),
              10_000,
            );
          }),
        ]);
      } catch (error) {
        // Provider errors can contain credentials and bodies; log only safe codes.
        const known = error instanceof EmailDeliveryError;
        failureCode = known ? error.code : "network_error";
        if (!known || error.retryable) {
          const backoff =
            [30_000, 120_000, 600_000, 1_800_000][job.attempts - 1] ??
            3_600_000;
          retryAt =
            now() + Math.max(backoff, known ? (error.retryAfterMs ?? 0) : 0);
        }
      } finally {
        clearTimeout(timeout);
      }
      await asyncDispatch(
        db,
        finishEmailJob({
          id: job.id,
          leaseId,
          now: now(),
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
      if (!stopped && paceMs > 0) await delay(paceMs);
    }
  }

  function runOnce(): Promise<void> {
    if (running) return running;
    running = drain().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    runOnce,
    start() {
      stopped = false;
      const tick = () => {
        void runOnce().catch(() =>
          log({ status: "worker_error", code: "database_error" }),
        );
      };
      timer = setInterval(tick, 5_000);
      timer.unref();
      tick();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
