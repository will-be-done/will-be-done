import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cause, Effect, Exit, Fiber } from "effect";
import { runGoogleFlow } from "./useGoogleFlow";

const google = vi.hoisted(() => ({
  beginSignIn: { mutate: vi.fn() },
  beginLink: { mutate: vi.fn() },
  poll: { mutate: vi.fn() },
  completeSignIn: { mutate: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpcClient: { google },
  resetWsClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  authUtils: { getUserId: () => null, getToken: () => null },
}));
vi.mock("@/lib/analytics", () => ({
  captureWebAnalytics: vi.fn(),
  identifyWebAnalyticsUser: vi.fn(),
}));
vi.mock("@/lib/query", () => ({ queryClient: { clear: vi.fn() } }));

type ActiveFlow = Parameters<typeof runGoogleFlow>[2];

// Matches the signed-out session the auth mock reports.
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

const opened: ActiveFlow[] = [];
const start = (current: ActiveFlow) => {
  opened.push(current);
  return current;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubGlobal("window", { focus: vi.fn() });
  for (const procedure of Object.values(google)) procedure.mutate.mockReset();
  google.beginSignIn.mutate.mockImplementation(async () => flow());
  google.beginLink.mutate.mockImplementation(async () => flow());
});

afterEach(() => {
  for (const current of opened.splice(0)) current.channel?.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Google sign-in flow", () => {
  it("polls again as soon as the popup reports completion", async () => {
    const firstPoll = deferred<void>();
    google.poll.mutate
      .mockImplementationOnce(async () => {
        firstPoll.resolve();
        return pending;
      })
      .mockResolvedValueOnce(ready);
    const { popup, window: popupWindow } = fakePopup();
    const result = Effect.runPromise(
      runGoogleFlow(
        "link",
        undefined,
        start({ popup: popupWindow, session: signedOut }),
      ),
    );

    await firstPoll.promise;
    expect(popup.location.href).toBe(launchUrl);
    const callbackPage = new BroadcastChannel("wbd-google-flow-1");
    callbackPage.postMessage("complete");
    callbackPage.close();

    // No timer is advanced, so only the completion message can start this poll.
    expect(await result).toEqual({
      type: "link-ready",
      email: "user@gmail.com",
    });
    expect(google.poll.mutate).toHaveBeenCalledTimes(2);
    expect(popup.close).toHaveBeenCalled();
  });

  it("tolerates two consecutive poll failures and resets after a success", async () => {
    const offline = new Error("offline");
    google.poll.mutate
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(ready);
    google.completeSignIn.mutate.mockResolvedValue({
      token: "token-1",
      userId: "user-1",
    });

    const result = Effect.runPromise(
      runGoogleFlow("signin", desktop(), start({ session: signedOut })),
    );
    await vi.advanceTimersByTimeAsync(5 * 2_000);

    expect(await result).toEqual({
      type: "signed-in",
      token: "token-1",
      userId: "user-1",
    });
    expect(google.poll.mutate).toHaveBeenCalledTimes(6);
    expect(google.completeSignIn.mutate).toHaveBeenCalledWith({
      id: "flow-1",
      secret: "secret",
      completion: "code",
    });
  });

  it("ends the flow after three consecutive poll failures", async () => {
    google.poll.mutate.mockRejectedValue(new Error("Network down"));
    const failure = Effect.runPromise(
      Effect.flip(
        runGoogleFlow("signin", desktop(), start({ session: signedOut })),
      ),
    );
    await vi.advanceTimersByTimeAsync(2 * 2_000);

    expect(await failure).toMatchObject({
      reason: "request_failed",
      message: "Network down",
    });
    expect(google.poll.mutate).toHaveBeenCalledTimes(3);
  });

  it("reports an expired flow once polling outlives it", async () => {
    google.beginSignIn.mutate.mockResolvedValue(flow(5_000));
    google.poll.mutate.mockResolvedValue(pending);
    const failure = Effect.runPromise(
      Effect.flip(
        runGoogleFlow("signin", desktop(), start({ session: signedOut })),
      ),
    );
    await vi.advanceTimersByTimeAsync(6_000);

    expect(await failure).toMatchObject({
      reason: "expired",
      message: "Google sign-in expired. Please try again.",
    });
    expect(google.poll.mutate).toHaveBeenCalledTimes(3);
  });

  it("reports the server's error when the desktop browser returns no code", async () => {
    google.poll.mutate.mockResolvedValue({
      status: "error",
      email: null,
      error: "Google sign-in was cancelled.",
    });
    const failure = Effect.runPromise(
      Effect.flip(
        runGoogleFlow("signin", desktop(null), start({ session: signedOut })),
      ),
    );

    expect(await failure).toMatchObject({
      reason: "google_error",
      message: "Google sign-in was cancelled.",
    });
    expect(google.poll.mutate).toHaveBeenCalledWith({
      id: "flow-1",
      secret: "secret",
    });
  });

  it("records the flow when cancelled mid-begin, then stops before opening Google", async () => {
    const begin = deferred<ReturnType<typeof flow>>();
    google.beginSignIn.mutate.mockReturnValue(begin.promise);
    const { popup, window: popupWindow } = fakePopup();
    const current = start({ popup: popupWindow, session: signedOut });
    const fiber = Effect.runFork(runGoogleFlow("signin", undefined, current));

    const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
    begin.resolve(flow());
    await interrupted;

    // cancel() closes this flow on the server once the interrupt returns.
    expect(current.flow).toMatchObject({ id: "flow-1", secret: "secret" });
    expect(popup.location.href).toBe("about:blank");
    expect(google.poll.mutate).not.toHaveBeenCalled();
  });

  it("does not complete sign-in after the session changed in another tab", async () => {
    google.poll.mutate.mockResolvedValue(ready);
    const exit = await Effect.runPromiseExit(
      runGoogleFlow("signin", desktop(), start({ session: "user-2:token-2" })),
    );

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    );
    expect(google.completeSignIn.mutate).not.toHaveBeenCalled();
  });
});
