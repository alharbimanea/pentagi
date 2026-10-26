import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { clientIp, hashIdentifier } from "@/lib/security/request";

export const LIMITS = {
  login: { limit: 10, windowSeconds: 900 },
  register: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  contact: { limit: 5, windowSeconds: 3600 },
  message: { limit: 60, windowSeconds: 600 },
  upload: { limit: 40, windowSeconds: 3600 },
  orderWrite: { limit: 120, windowSeconds: 3600 },
  linkCode: { limit: 5, windowSeconds: 3600 },
  ai: { limit: 30, windowSeconds: 3600 },
  checkout: { limit: 20, windowSeconds: 3600 },
} as const;

export type LimitName = keyof typeof LIMITS;

// Backed by Postgres so the limit holds across serverless instances. If the
// limiter itself is unreachable the request is refused, not waved through.
export async function rateLimit(name: LimitName, subject?: string | null): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[name];
  const who = subject ?? (await clientIp()) ?? "unknown";
  const { data, error } = await adminClient().rpc("check_rate_limit", {
    p_key: `${name}:${hashIdentifier(who)}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limiter unavailable", error.message);
    return false;
  }
  return data === true;
}
