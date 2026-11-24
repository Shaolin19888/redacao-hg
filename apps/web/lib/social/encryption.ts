import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.SOCIAL_ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length < 64) {
    throw new Error("SOCIAL_ENCRYPTION_KEY inválida ou ausente. Deve ser uma string hex de 64 caracteres (32 bytes).");
  }
  return Buffer.from(KEY_HEX, "hex");
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv(12):tag(16):dados
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = encoded.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Token encriptado com formato inválido.");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}

export function generateKey(): string {
  return randomBytes(32).toString("hex");
}
