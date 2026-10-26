"use client";

import { updateProfileAction } from "@/actions/profile";
import { createTelegramLinkCodeAction } from "@/actions/support";
import { Alert } from "@/components/ui/alert";
import { useActionForm } from "@/hooks/use-action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Dictionary, Locale } from "@/lib/i18n";

export function ProfileForm({
  locale,
  dict,
  profile,
}: {
  locale: Locale;
  dict: Dictionary;
  profile: { full_name: string | null; locale: string; timezone: string; preferred_currency: string; phone: string | null; marketing_opt_in: boolean };
}) {
  const { state, pending, formRef, onSubmit } = useActionForm(updateProfileAction);
  const t = dict.settings;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="ui_locale" value={locale} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Field label={t.fullName} htmlFor="full_name" error={state.fieldErrors?.full_name}>
        <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t.locale} htmlFor="locale">
          <Select id="locale" name="locale" defaultValue={profile.locale}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
        <Field label={t.timezone} htmlFor="timezone" error={state.fieldErrors?.timezone}>
          <Input id="timezone" name="timezone" defaultValue={profile.timezone} required />
        </Field>
        <Field label={t.currency} htmlFor="preferred_currency">
          <Select id="preferred_currency" name="preferred_currency" defaultValue={profile.preferred_currency}>
            <option value="SAR">SAR</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <Field label={t.phone} htmlFor="phone" error={state.fieldErrors?.phone}>
        <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={profile.phone ?? ""} placeholder="+9665XXXXXXXX" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="marketing_opt_in" defaultChecked={profile.marketing_opt_in} />
        Marketing / تسويق
      </label>
      <SubmitButton pending={pending}>{dict.actions.save}</SubmitButton>
    </form>
  );
}

export function TelegramLink({ locale, dict, botUsername }: { locale: Locale; dict: Dictionary; botUsername: string }) {
  const { state, pending, formRef, onSubmit } = useActionForm(createTelegramLinkCodeAction);
  const code = state.data?.code as string | undefined;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-2">
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {code ? (
        <Alert>
          {dict.settings.linkCode}{" "}
          <code className="font-mono text-base font-semibold" dir="ltr">
            /link {code}
          </code>{" "}
          →{" "}
          <a className="text-accent underline" href={`https://t.me/${botUsername}?start=${code}`} target="_blank" rel="noopener noreferrer">
            @{botUsername}
          </a>
        </Alert>
      ) : null}
      <SubmitButton pending={pending} variant="outline" size="sm">
        {dict.settings.linkTelegram}
      </SubmitButton>
    </form>
  );
}
