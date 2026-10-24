import * as ExpoCrypto from "expo-crypto";

// HyperDB and uuidv7 need Web Crypto randomness; the sync engine hashes
// payloads with crypto.subtle.digest. Hermes ships none of these.
const webCrypto = (globalThis.crypto ??= {} as Crypto);

webCrypto.getRandomValues ??=
  ExpoCrypto.getRandomValues as Crypto["getRandomValues"];
webCrypto.randomUUID ??= ExpoCrypto.randomUUID as Crypto["randomUUID"];

if (!webCrypto.subtle) {
  Object.defineProperty(webCrypto, "subtle", {
    value: {
      digest: (algorithm: string, data: BufferSource) =>
        ExpoCrypto.digest(algorithm as ExpoCrypto.CryptoDigestAlgorithm, data),
    },
  });
}
