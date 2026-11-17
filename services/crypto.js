import crypto from "crypto";

const KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "hex");

// Bank account and national ID are encrypted (AES-256-GCM) before they are stored. Used by employees and onboarding.
export const encrypt = (text) => {
  if (!text) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
};

export const decrypt = (blob) => {
  if (!blob) return undefined;
  const [iv, tag, data] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};
