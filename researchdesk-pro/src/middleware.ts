import { NextResponse, type NextRequest } from "next/server";
import { isLocale, pickLocale } from "@/lib/i18n";
import { refreshSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (!isLocale(first)) {
    const preferred = request.cookies.get("locale")?.value;
    const locale = isLocale(preferred) ? preferred : pickLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  return refreshSession(request, NextResponse.next({ request }));
}

export const config = {
  matcher: ["/((?!api|auth/callback|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
