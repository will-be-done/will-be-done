import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1:";

const keyFrom = (secret: string) =>
  createHash("sha256").update(secret).digest();

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")
  );
}

export function decryptSecret(sealed: string, secret: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error("Unknown secret format");
  const data = Buffer.from(sealed.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFrom(secret),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
