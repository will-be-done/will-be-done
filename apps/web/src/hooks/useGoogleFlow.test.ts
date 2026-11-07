import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cause, Effect, Exit, Layer, PubSub, Stream } from "effect";
import {
  cancelActiveFlow,
  GoogleAuthApi,
  GoogleFlowError,
  runGoogleFlow,
  type ActiveGoogleFlow,
} from "@/lib/googleFlow";
import { makeTestPage, testAuthSession } from "@/services/testing";

// Promise doubles for the server procedures; the service maps rejections the
// way the live tRPC layer does.
const google = {
  begin: vi.fn(),
  poll: vi.fn(),
  completeSignIn: vi.fn(),
  cancel: vi.fn(),
};
const call =
  <Args extends unknown[]>(procedure: (...args: Args) => Promise<unknown>) =>
  (...args: Args) =>
    Effect.tryPromise({
      try: () => procedure(...args),
      catch: (cause) =>
        new GoogleFlowError({
          reason: "request_failed",
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    });

let page = makeTestPage();
let popupCompletions = Effect.runSync(PubSub.unbounded<void>());
const layer = () =>
  Layer.mergeAll(
    Layer.succeed(GoogleAuthApi, {
      begin: (intent, desktop) =>
        call(google.begin)(intent, desktop) as ReturnType<
          GoogleAuthApi["Service"]["begin"]
        >,
      poll: (proof) =>
        call(google.poll)(proof) as ReturnType<
          GoogleAuthApi["Service"]["poll"]
        >,
      completeSignIn: (proof) =>
        call(google.completeSignIn)(proof) as ReturnType<
          GoogleAuthApi["Service"]["completeSignIn"]
        >,
      completeLink: () => Effect.void,
      cancel: (flow) => Effect.promise(async () => void google.cancel(flow)),
      completions: () => Stream.fromPubSub(popupCompletions),
    }),
    testAuthSession(signedOut),
    page.layer,
  );
const run = <A, E>(effect: Effect.Effect<A, E, GoogleServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer())));
const runExit = <A, E>(effect: Effect.Effect<A, E, GoogleServices>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layer())));
type GoogleServices = Layer.Success<ReturnType<typeof layer>>;

// Matches the signed-out session the auth layer reports.
const signedOut = ":";
const launchUrl = "https://accounts.example/launch";
const pending = { status: "pending", email: null, error: null };
const ready = { status: "ready", email: "user@gmail.com", error: null };
const desktop = (completion: string | null = "code") =>
  ({
    runGoogleAuth: async () => completion,
  }) as unknown as Window["desktopApi"];

const flow = (expiresInMs = 60_000) => ({
  id: "flow-1",
  secret: "secret",
  expiresAt: Date.now() + expiresInMs,
  launchUrl,
});

const fakePopup = () => {
  const popup = { location: { href: "about:blank" }, close: vi.fn() };
  return { popup, window: popup as unknown as Window };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const start = (current: ActiveGoogleFlow) => current;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  page = makeTestPage();
  popupCompletions = Effect.runSync(PubSub.unbounded<void>());
  for (const procedure of Object.values(google)) procedure.mockReset();
  google.begin.mockImplementation(async () => flow());
  google.cancel.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Google sign-in flow", () => {
  it("polls again as soon as the popup reports completion", async () => {
    const firstPoll = deferred<void>();
    google.poll
      .mockImplementationOnce(async () => {
        firstPoll.resolve();
        return pending;
      })
      .mockResolvedValueOnce(ready);
    const { popup, window: popupWindow } = fakePopup();
    const result = run(
      runGoogleFlow(
        "link",
        undefined,
        start({ popup: popupWindow, session: signedOut }),
      ),
    );

    await firstPoll.promise;
    expect(popup.location.href).toBe(launchUrl);
    PubSub.publishUnsafe(popupCompletions, undefined);

    // No timer is advanced, so only the completion message can start this poll.
    expect(await result).toEqual({
      type: "link-ready",
      email: "user@gmail.com",
    });
    expect(google.poll).toHaveBeenCalledTimes(2);
    expect(popup.close).toHaveBeenCalled();
    expect(page.focused).toBe(1);
  });

  it("tolerates two consecutive poll failures and resets after a success", async () => {
    const offline = new Error("offline");
    google.poll
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(ready);
    google.completeSignIn.mockResolvedValue({
      token: "token-1",
      userId: "user-1",
    });

    const result = run(
      runGoogleFlow("signin", desktop(), start({ session: signedOut })),
    );
    await vi.advanceTimersByTimeAsync(5 * 2_000);

    expect(await result).toEqual({
      type: "signed-in",
      token: "token-1",
      userId: "user-1",
    });
    expect(google.poll).toHaveBeenCalledTimes(6);
    expect(google.completeSignIn).toHaveBeenCalledWith({
      id: "flow-1",
      secret: "secret",
      completion: "code",
    });
  });

  it("ends the flow after three consecutive poll failures", async () => {
    google.poll.mockRejectedValue(new Error("Network down"));
    const failure = run(
      Effect.flip(
        runGoogleFlow("signin", desktop(), start({ session: signedOut })),
      ),
    );
    await vi.advanceTimersByTimeAsync(2 * 2_000);

    expect(await failure).toMatchObject({
      reason: "request_failed",
      message: "Network down",
    });
    expect(google.poll).toHaveBeenCalledTimes(3);
  });

  it("reports an expired flow once polling outlives it", async () => {
    google.begin.mockResolvedValue(flow(5_000));
    google.poll.mockResolvedValue(pending);
    const failure = run(
      Effect.flip(
        runGoogleFlow("signin", desktop(), start({ session: signedOut })),
      ),
    );
    await vi.advanceTimersByTimeAsync(6_000);

    expect(await failure).toMatchObject({
      reason: "expired",
      message: "Google sign-in expired. Please try again.",
    });
    expect(google.poll).toHaveBeenCalledTimes(3);
  });

  it("reports the server's error when the desktop browser returns no code", async () => {
    google.poll.mockResolvedValue({
      status: "error",
      email: null,
      error: "Google sign-in was cancelled.",
    });
    const failure = run(
      Effect.flip(
        runGoogleFlow("signin", desktop(null), start({ session: signedOut })),
      ),
    );

    expect(await failure).toMatchObject({
      reason: "google_error",
      message: "Google sign-in was cancelled.",
    });
    expect(google.poll).toHaveBeenCalledWith({
      id: "flow-1",
      secret: "secret",
    });
  });

  it("cancels a flow on the server once a cancelled begin request returns it", async () => {
    const begin = deferred<ReturnType<typeof flow>>();
    google.begin.mockReturnValue(begin.promise);
    const { popup, window: popupWindow } = fakePopup();
    const current = start({ popup: popupWindow, session: signedOut });
    current.fiber = Effect.runFork(
      runGoogleFlow("signin", undefined, current).pipe(Effect.provide(layer())),
    );
    expect(google.begin).toHaveBeenCalledOnce();

    const cancelled = run(cancelActiveFlow(current));
    expect(popup.close).toHaveBeenCalled();
    begin.resolve(flow());
    await cancelled;

    expect(google.cancel).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "flow-1", secret: "secret" }),
    );
    expect(popup.location.href).toBe("about:blank");
    expect(google.poll).not.toHaveBeenCalled();
  });

  it("does not complete sign-in after the session changed in another tab", async () => {
    google.poll.mockResolvedValue(ready);
    const exit = await runExit(
      runGoogleFlow("signin", desktop(), start({ session: "user-2:token-2" })),
    );

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    );
    expect(google.completeSignIn).not.toHaveBeenCalled();
  });
});
