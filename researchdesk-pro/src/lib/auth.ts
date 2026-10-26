import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/lib/i18n";
import { configValue } from "@/lib/config";
import { serverClient } from "@/lib/supabase/server";

export interface Viewer {
  user: User;
  roles: string[];
  isAdminRole: boolean;
  aal: "aal1" | "aal2";
  profile: { full_name: string | null; locale: Locale; timezone: string; preferred_currency: string } | null;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: roles }, { data: profile }, { data: claims }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name, locale, timezone, preferred_currency").eq("id", user.id).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  const list = (roles ?? []).map((r: { role: string }) => r.role);
  return {
    user,
    roles: list,
    isAdminRole: list.includes("admin"),
    aal: claims?.claims.aal === "aal2" ? "aal2" : "aal1",
    profile: (profile as Viewer["profile"]) ?? null,
  };
});

export async function requireViewer(locale: Locale, next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return viewer;
}

// The database enforces aal2 for every admin read and write; this redirect
// only spares the owner a page full of empty results.
export async function requireAdmin(locale: Locale): Promise<Viewer> {
  const viewer = await requireViewer(locale, `/${locale}/admin`);
  if (!viewer.isAdminRole) redirect(`/${locale}/portal`);
  if (viewer.aal !== "aal2" && (await configValue("require_admin_mfa", true))) redirect(`/${locale}/mfa?next=/${locale}/admin`);
  return viewer;
}

export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
