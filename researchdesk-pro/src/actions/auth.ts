"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/actions/types";
import { safeNext } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { POLICY_VERSION } from "@/lib/i18n/legal";
import { passwordSchema, type PasswordProblem } from "@/lib/password-policy";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

const localeOf = (form: FormData): Locale => {
  const value = String(form.get("locale") ?? "");
  return isLocale(value) ? value : "en";
};

const callbackUrl = (next: string) => `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email().max(254),
      password: passwordSchema,
      full_name: z.string().trim().min(2).max(120),
      accept: z.literal("on"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] =
        key === "password" ? (dict.auth.passwordProblems[issue.message as PasswordProblem] ?? dict.auth.passwordRules) : dict.errors.validation;
    }
    return { error: dict.errors.validation, fieldErrors };
  }
  if (!(await rateLimit("register"))) return { error: dict.errors.rateLimited };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { error: dict.errors.captcha };

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: callbackUrl(`/${locale}/portal`), data: { full_name: parsed.data.full_name, locale } },
  });
  if (error && error.status !== 422) {
    console.error("sign-up failed", error.message);
    return { error: dict.errors.generic };
  }
  // Supabase returns a placeholder user for an already-registered address,
  // so the consent insert fails silently there and the reply stays the same
  // either way — the form never reveals whether an account exists.
  if (data.user?.id) {
    await adminClient()
      .from("consent_records")
      .insert([
        { user_id: data.user.id, kind: "terms", version: POLICY_VERSION, granted: true },
        { user_id: data.user.id, kind: "privacy", version: POLICY_VERSION, granted: true },
      ]);
  }
  return { ok: true, message: dict.auth.checkEmail };
}

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: dict.auth.invalidCredentials };
  if (!(await rateLimit("login", `${await clientIp()}:${email}`))) return { error: dict.errors.rateLimited };

  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: dict.auth.invalidCredentials };
  redirect(safeNext(String(form.get("next") ?? ""), `/${locale}/portal`));
}

export async function signOutAction(form: FormData) {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect(`/${localeOf(form)}`);
}

export async function googleSignInAction(form: FormData) {
  const locale = localeOf(form);
  if (!publicEnv.googleAuthEnabled) redirect(`/${locale}/login`);
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(safeNext(String(form.get("next") ?? ""), `/${locale}/portal`)) },
  });
  if (error || !data.url) redirect(`/${locale}/login?error=oauth`);
  redirect(data.url);
}

export async function requestPasswordResetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { error: dict.errors.validation };
  if (!(await rateLimit("passwordReset", `${await clientIp()}:${email.data}`))) return { error: dict.errors.rateLimited };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), await clientIp()))) return { error: dict.errors.captcha };
  const supabase = await serverClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: callbackUrl(`/${locale}/reset-password`) });
  return { ok: true, message: dict.auth.resetSent };
}

export async function updatePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locale = localeOf(form);
  const dict = getDictionary(locale);
  const parsed = passwordSchema.safeParse(form.get("password"));
  if (!parsed.success) {
    const problem = parsed.error.issues[0]?.message as PasswordProblem;
    return { error: dict.auth.passwordProblems[problem] ?? dict.auth.passwordRules, fieldErrors: { password: dict.auth.passwordProblems[problem] ?? "" } };
  }
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/forgot-password`);
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: dict.errors.generic };
  return { ok: true, message: dict.auth.passwordUpdated };
}
