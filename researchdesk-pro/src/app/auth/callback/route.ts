import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/en/portal");
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`${next.startsWith("/ar") ? "/ar" : "/en"}/login?error=link`, url.origin));
}
