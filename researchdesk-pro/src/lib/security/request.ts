import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

// Vercel and Cloudflare set these; the left-most x-forwarded-for entry is the
// client as seen by the first proxy.
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(`${serverEnv().IP_HASH_SALT}:${value}`).digest("hex").slice(0, 32);
}
