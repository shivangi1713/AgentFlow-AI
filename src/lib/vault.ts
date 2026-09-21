import crypto from "crypto";
import { cleanEnv, isPlaceholder } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;

function getEncryptionKey() {
  const configuredKey = cleanEnv(process.env.ENCRYPTION_SECRET_32_BYTES);

  if (!configuredKey || isPlaceholder(configuredKey)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_SECRET_32_BYTES is required in production");
    }

    return Buffer.alloc(KEY_LENGTH_BYTES);
  }

  const key = Buffer.from(configuredKey, "hex");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error("ENCRYPTION_SECRET_32_BYTES must be a 32-byte hex string");
  }

  return key;
}

export function encryptSecret(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(encryptedData: string) {
  const [ivHex, authTagHex, encryptedText] = encryptedData.split(":");

  if (!ivHex || !authTagHex || !encryptedText) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
