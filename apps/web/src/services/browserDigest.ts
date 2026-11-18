import { sha256 } from "@noble/hashes/sha2.js";
import { Effect, Layer } from "effect";
import { Digest, WebCrypto } from "effect/crypto";

const sha256Fallback = { ...Digest.sha256, implementation: sha256 };

export const BrowserDigestLive = Layer.effect(
  Digest.Digest,
  Effect.gen(function* () {
    const crypto = yield* WebCrypto.WebCrypto;
    const digest = yield* Digest.Digest;
    if (crypto?.subtle) return digest;

    const withFallback = (algorithm: Digest.Algorithm) =>
      algorithm.name === "SHA-256" && !algorithm.implementation
        ? sha256Fallback
        : algorithm;

    return {
      digest: (algorithm, data) => digest.digest(withFallback(algorithm), data),
      digestHex: (algorithm, data) =>
        digest.digestHex(withFallback(algorithm), data),
    };
  }),
).pipe(Layer.provide(Digest.layerWebCrypto));
