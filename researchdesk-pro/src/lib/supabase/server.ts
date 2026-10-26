import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieName, publicEnv } from "@/lib/env";

export async function serverClient() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseServerUrl, publicEnv.supabaseAnonKey, {
    cookieOptions: { name: authCookieName() },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}
