import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { authCookieName, publicEnv } from "@/lib/env";

export async function refreshSession(request: NextRequest, response: NextResponse) {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return response;
  const supabase = createServerClient(publicEnv.supabaseServerUrl, publicEnv.supabaseAnonKey, {
    cookieOptions: { name: authCookieName() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value, options } of items) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
