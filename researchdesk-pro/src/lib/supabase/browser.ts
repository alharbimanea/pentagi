import { createBrowserClient } from "@supabase/ssr";
import { authCookieName, publicEnv } from "@/lib/env";

export function browserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { cookieOptions: { name: authCookieName() } });
}
