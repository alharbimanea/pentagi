import "server-only";
import { serverEnv } from "@/lib/env";

// Without a secret the check passes outside production so local development
// works, and fails closed in production.
export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const env = serverEnv();
  if (!env.TURNSTILE_SECRET_KEY) return env.NODE_ENV !== "production";
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store" });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
