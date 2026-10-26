"use client";

import { contactAction } from "@/actions/support";
import { Turnstile } from "@/components/site/turnstile";
import { Alert } from "@/components/ui/alert";
import { useActionForm } from "@/hooks/use-action-form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Dictionary, Locale } from "@/lib/i18n";

export function ContactForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, pending, formRef, onSubmit } = useActionForm(contactAction);
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  const t = dict.contact;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div aria-hidden className="hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} htmlFor="name" error={state.fieldErrors?.name}>
          <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120} aria-invalid={Boolean(state.fieldErrors?.name)} />
        </Field>
        <Field label={t.email} htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.fieldErrors?.email)} />
        </Field>
      </div>
      <Field label={t.subject} htmlFor="subject" error={state.fieldErrors?.subject}>
        <Input id="subject" name="subject" required minLength={3} maxLength={200} aria-invalid={Boolean(state.fieldErrors?.subject)} />
      </Field>
      <Field label={t.message} htmlFor="body" error={state.fieldErrors?.body}>
        <Textarea id="body" name="body" required minLength={10} maxLength={5000} rows={6} aria-invalid={Boolean(state.fieldErrors?.body)} />
      </Field>
      <Turnstile locale={locale} />
      <SubmitButton pending={pending}>{dict.actions.send}</SubmitButton>
    </form>
  );
}
