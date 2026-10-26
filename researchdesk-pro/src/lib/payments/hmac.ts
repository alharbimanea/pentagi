import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyHmacSha256(secret: string, body: string, signature: string | null): boolean {
  if (!secret || !signature) return false;
  const provided = signature.replace(/^sha256=/, "").trim().toLowerCase();
  return safeEqual(hmacSha256Hex(secret, body), provided);
}
