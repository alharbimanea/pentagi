"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordResetAction, signInAction, signUpAction, updatePasswordAction } from "@/actions/auth";
import { Turnstile } from "@/components/site/turnstile";
import { Alert } from "@/components/ui/alert";
import { useActionForm } from "@/hooks/use-action-form";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Dictionary, Locale } from "@/lib/i18n";
import { checkPassword } from "@/lib/password-policy";

function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  if (message) return <Alert tone="success">{message}</Alert>;
  return null;
}

function PasswordField({ dict, name = "password", label, error }: { dict: Dictionary; name?: string; label: string; error?: string }) {
  const [value, setValue] = useState("");
  const problem = value ? checkPassword(value) : null;
  return (
    <Field label={label} htmlFor={name} hint={dict.auth.passwordRules} error={error ?? (problem ? dict.auth.passwordProblems[problem] : undefined)}>
      <Input
        id={name}
        name={name}
        type="password"
        autoComplete="new-password"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={Boolean(error || problem)}
        aria-describedby={`${name}-hint ${name}-error`}
      />
    </Field>
  );
}

export function LoginForm({ locale, dict, next }: { locale: Locale; dict: Dictionary; next?: string }) {
  const { state, pending, formRef, onSubmit } = useActionForm(signInAction);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Feedback error={state.error} />
      <Field label={dict.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label={dict.auth.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <SubmitButton pending={pending}>{dict.auth.loginTitle}</SubmitButton>
        <Link href={`/${locale}/forgot-password`} className="text-sm text-accent hover:underline">
          {dict.auth.forgot}
        </Link>
      </div>
    </form>
  );
}

export function RegisterForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, pending, formRef, onSubmit } = useActionForm(signUpAction);
  if (state.ok) return <Feedback message={state.message} />;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Feedback error={state.error} />
      <Field label={dict.auth.fullName} htmlFor="full_name" error={state.fieldErrors?.full_name}>
        <Input id="full_name" name="full_name" autoComplete="name" required minLength={2} maxLength={120} />
      </Field>
      <Field label={dict.auth.email} htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <PasswordField dict={dict} label={dict.auth.password} error={state.fieldErrors?.password} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-1" />
        <span>
          {dict.auth.acceptTerms} (
          <Link className="text-accent underline" href={`/${locale}/legal/terms`} target="_blank">
            {dict.legal.pages.terms}
          </Link>
          ,{" "}
          <Link className="text-accent underline" href={`/${locale}/legal/privacy`} target="_blank">
            {dict.legal.pages.privacy}
          </Link>
          )
        </span>
      </label>
      <Turnstile locale={locale} />
      <SubmitButton pending={pending}>{dict.auth.registerTitle}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, pending, formRef, onSubmit } = useActionForm(requestPasswordResetAction);
  if (state.ok) return <Feedback message={state.message} />;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Feedback error={state.error} />
      <Field label={dict.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Turnstile locale={locale} />
      <SubmitButton pending={pending}>{dict.actions.send}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, pending, formRef, onSubmit } = useActionForm(updatePasswordAction);
  if (state.ok)
    return (
      <div className="space-y-4">
        <Feedback message={state.message} />
        <Link href={`/${locale}/portal`} className="text-accent underline">
          {dict.nav.portal}
        </Link>
      </div>
    );
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <Feedback error={state.error} />
      <PasswordField dict={dict} label={dict.auth.newPassword} error={state.fieldErrors?.password} />
      <SubmitButton pending={pending}>{dict.actions.save}</SubmitButton>
    </form>
  );
}
