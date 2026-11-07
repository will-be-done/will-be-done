import { Duration, Effect, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

const SiteverifyResponse = Schema.Struct({
  body: Schema.Struct({ success: Schema.Boolean }),
});

export const verifyCaptchaToken = Effect.fn("verifyCaptchaToken")(
  function* (token: string, secretKey: string, _timeout: Duration.Input) {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.post(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      ).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          secret: secretKey,
          response: token,
        }),
      ),
    );
    const { body } =
      yield* HttpClientResponse.schemaJson(SiteverifyResponse)(response);
    return body.success;
  },
  (effect, _token, _secretKey, timeout) =>
    Effect.timeoutOrElse(effect, {
      duration: timeout,
      orElse: () => Effect.succeed(false),
    }),
);
