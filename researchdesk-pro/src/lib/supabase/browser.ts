import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function browserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
