"use client";

import { requestRevisionAction } from "@/actions/orders";
import { Alert } from "@/components/ui/alert";
import { useActionForm } from "@/hooks/use-action-form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Dictionary, Locale } from "@/lib/i18n";

export function RevisionForm({ orderId, locale, dict, timezone, additional }: { orderId: string; locale: Locale; dict: Dictionary; timezone: string; additional: boolean }) {
  const { state, pending, formRef, onSubmit } = useActionForm(requestRevisionAction);
  const t = dict.workspace;
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className="space-y-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="timezone" value={timezone} />
      {additional ? <Alert tone="warning">{t.revisionAdditional}</Alert> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label={t.revisionDescription} htmlFor="description">
        <Textarea id="description" name="description" required minLength={10} maxLength={4000} rows={3} />
      </Field>
      <Field label={t.revisionChanges} htmlFor="requested_changes">
        <Textarea id="requested_changes" name="requested_changes" required maxLength={10000} rows={5} />
      </Field>
      <Field label={t.revisionDeadline} htmlFor="proposed_deadline">
        <Input id="proposed_deadline" name="proposed_deadline" type="datetime-local" />
      </Field>
      <SubmitButton pending={pending}>{t.revisionTitle}</SubmitButton>
    </form>
  );
}
