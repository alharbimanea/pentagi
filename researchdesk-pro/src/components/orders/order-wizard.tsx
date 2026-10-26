"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteDraftAction, previewEstimateAction, saveDraftAction, submitOrderAction } from "@/actions/orders";
import { initialState } from "@/actions/types";
import { EstimateView } from "@/components/orders/estimate-view";
import { FileUploader } from "@/components/orders/file-uploader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Dictionary, Locale } from "@/lib/i18n";
import { CITATION_STYLES, INTENDED_USES, LANGUAGES, type MissingField } from "@/lib/orders/schema";
import type { EstimateResult } from "@/lib/pricing/engine";
import { cn } from "@/lib/utils";

export interface WizardService {
  id: string;
  slug: string;
  unit: "word" | "page" | "hour" | "slide" | "fixed";
  name: string;
  description: string;
  revisions_included: number;
}

export interface WizardOption {
  code: string;
  label: string;
}

export interface WizardOrder {
  id: string;
  service_id: string;
  title: string;
  discipline: string | null;
  intended_use: string | null;
  scope: string | null;
  level: string | null;
  complexity: string | null;
  word_count: number | null;
  page_count: number | null;
  citation_style: string | null;
  references_notes: string | null;
  methodology: string | null;
  language: string;
  deadline_local: string;
  timezone: string;
  instructions: string | null;
  addons: string[];
  promo_code: string | null;
  currency: "SAR" | "USD";
}

const STEPS = ["service", "details", "scope", "deadline", "files", "review"] as const;
type Step = (typeof STEPS)[number];

const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat", "Africa/Cairo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Kuala_Lumpur", "Australia/Sydney", "UTC"];

export function OrderWizard({
  locale,
  dict,
  services,
  levels,
  complexities,
  addons,
  order,
  files,
  defaultServiceSlug,
  defaultTimezone,
  defaultCurrency,
  initialEstimate,
}: {
  locale: Locale;
  dict: Dictionary;
  services: WizardService[];
  levels: WizardOption[];
  complexities: WizardOption[];
  addons: WizardOption[];
  order: WizardOrder | null;
  files: Array<{ id: string; name: string; scan: string }>;
  defaultServiceSlug?: string;
  defaultTimezone: string;
  defaultCurrency: "SAR" | "USD";
  initialEstimate: EstimateResult | null;
}) {
  const t = dict.wizard;
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<Step>("service");
  const [orderId, setOrderId] = useState<string | null>(order?.id ?? null);
  const [serviceId, setServiceId] = useState(order?.service_id ?? services.find((s) => s.slug === defaultServiceSlug)?.id ?? services[0]?.id ?? "");
  const [estimate, setEstimate] = useState<EstimateResult | null>(initialEstimate);
  const [uploaded, setUploaded] = useState(files);
  const [saveState, saveAction, saving] = useActionState(saveDraftAction, initialState);
  const [submitState, submitAction, submitting] = useActionState(submitOrderAction, initialState);
  const busy = saving || submitting;
  const [, startPreview] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const unit = service?.unit ?? "fixed";

  useEffect(() => {
    const id = (saveState.data?.orderId ?? submitState.data?.orderId) as string | undefined;
    if (id && id !== orderId) {
      setOrderId(id);
      window.history.replaceState(null, "", `/${locale}/portal/orders/${id}`);
    }
    const est = (saveState.data?.estimate ?? submitState.data?.estimate) as EstimateResult | undefined;
    if (est !== undefined) setEstimate(est);
  }, [saveState, submitState, orderId, locale]);

  function schedulePreview() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!formRef.current) return;
      const data = new FormData(formRef.current);
      startPreview(async () => {
        const result = await previewEstimateAction(initialState, data);
        if (result.ok) setEstimate((result.data?.estimate as EstimateResult | null) ?? null);
      });
    }, 600);
  }

  // Dispatching from onSubmit instead of <form action> keeps React from
  // resetting every uncontrolled field to its default after each save.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget);
    const intent = submitter?.value;
    startTransition(() => {
      if (intent === "submit") submitAction(data);
      else if (intent === "delete") void deleteDraftAction(data);
      else saveAction(data);
    });
  }

  const missing = (submitState.data?.missing as MissingField[] | undefined) ?? [];
  const index = STEPS.indexOf(step);
  const panel = (s: Step) => cn("space-y-4", step !== s && "hidden");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form ref={formRef} onSubmit={onSubmit} onChange={schedulePreview} className="space-y-6" noValidate>
        <input type="hidden" name="locale" value={locale} />
        {orderId ? <input type="hidden" name="order_id" value={orderId} /> : null}

        <nav aria-label={t.title}>
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setStep(s)}
                  aria-current={s === step ? "step" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    s === step ? "border-accent bg-accent text-accent-foreground" : i < index ? "border-accent/50 text-accent" : "text-muted-foreground",
                  )}
                >
                  {i + 1}. {t.steps[s]}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {saveState.error ? <Alert tone="error">{saveState.error}</Alert> : null}
        {saveState.ok ? <Alert tone="success">{saveState.message}</Alert> : null}
        {submitState.error ? (
          <Alert tone="error">
            {submitState.error}
            {missing.length ? (
              <ul className="mt-1 list-disc ps-5">
                {missing.map((m) => (
                  <li key={m}>{t.missingFields[m]}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        <section className={panel("service")} aria-labelledby="step-service">
          <h2 id="step-service" className="text-lg font-semibold">
            {t.chooseService}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className={cn("cursor-pointer rounded-lg border p-4 transition-colors", serviceId === s.id ? "border-accent bg-accent/5" : "hover:bg-muted")}>
                <input type="radio" name="service_id" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} className="sr-only" />
                <span className="font-medium">{s.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{s.description}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={panel("details")}>
          <Field label={t.titleLabel} htmlFor="title" error={saveState.fieldErrors?.title}>
            <Input id="title" name="title" defaultValue={order?.title ?? ""} maxLength={300} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.discipline} htmlFor="discipline">
              <Input id="discipline" name="discipline" defaultValue={order?.discipline ?? ""} maxLength={120} />
            </Field>
            <Field label={t.intendedUse} htmlFor="intended_use">
              <Select id="intended_use" name="intended_use" defaultValue={order?.intended_use ?? ""}>
                <option value="">—</option>
                {INTENDED_USES.map((u) => (
                  <option key={u} value={u}>
                    {t.intendedUses[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.level} htmlFor="level">
              <Select id="level" name="level" defaultValue={order?.level ?? ""}>
                <option value="">—</option>
                {levels.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.complexity} htmlFor="complexity">
              <Select id="complexity" name="complexity" defaultValue={order?.complexity ?? ""}>
                <option value="">—</option>
                {complexities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.language} htmlFor="language">
              <Select id="language" name="language" defaultValue={order?.language ?? (locale === "ar" ? "ar" : "en")}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t.languages[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.citationStyle} htmlFor="citation_style">
              <Select id="citation_style" name="citation_style" defaultValue={order?.citation_style ?? "none"}>
                {CITATION_STYLES.map((c) => (
                  <option key={c} value={c}>
                    {t.citationStyles[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        <section className={panel("scope")}>
          {unit !== "fixed" ? (
            <Field label={dict.units[`quantity_${unit}`]} htmlFor="quantity">
              <Input
                id="quantity"
                name={unit === "word" ? "word_count" : "page_count"}
                type="number"
                min={1}
                max={unit === "word" ? 200000 : 1000}
                inputMode="numeric"
                defaultValue={(unit === "word" ? order?.word_count : order?.page_count) ?? ""}
              />
            </Field>
          ) : null}
          <Field label={t.scope} htmlFor="scope">
            <Textarea id="scope" name="scope" defaultValue={order?.scope ?? ""} maxLength={4000} rows={3} />
          </Field>
          <Field label={t.methodology} htmlFor="methodology">
            <Textarea id="methodology" name="methodology" defaultValue={order?.methodology ?? ""} maxLength={4000} rows={3} />
          </Field>
          <Field label={t.references} htmlFor="references_notes">
            <Textarea id="references_notes" name="references_notes" defaultValue={order?.references_notes ?? ""} maxLength={4000} rows={3} />
          </Field>
          <Field label={t.instructions} htmlFor="instructions">
            <Textarea id="instructions" name="instructions" defaultValue={order?.instructions ?? ""} maxLength={20000} rows={6} />
          </Field>
          {addons.length ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t.addons}</legend>
              {addons.map((a) => (
                <label key={a.code} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="addons" value={a.code} defaultChecked={order?.addons.includes(a.code)} />
                  {a.label}
                </label>
              ))}
            </fieldset>
          ) : null}
        </section>

        <section className={panel("deadline")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.deadline} htmlFor="deadline_local">
              <Input id="deadline_local" name="deadline_local" type="datetime-local" defaultValue={order?.deadline_local ?? ""} />
            </Field>
            <Field label={t.timezone} htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue={order?.timezone ?? defaultTimezone}>
                {[...new Set([order?.timezone ?? defaultTimezone, ...TIMEZONES])].map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.currency} htmlFor="currency">
              <Select id="currency" name="currency" defaultValue={order?.currency ?? defaultCurrency}>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label={t.promo} htmlFor="promo_code">
              <Input id="promo_code" name="promo_code" defaultValue={order?.promo_code ?? ""} maxLength={32} autoCapitalize="characters" />
            </Field>
          </div>
        </section>

        <section className={panel("files")}>
          <p className="text-sm text-muted-foreground">{t.filesIntro}</p>
          {orderId ? (
            <>
              <FileUploader
                orderId={orderId}
                purpose="attachment"
                label={dict.actions.upload}
                locale={locale}
                refresh={false}
                onUploaded={(id, name) => setUploaded((prev) => [...prev, { id, name, scan: "done" }])}
              />
              <ul className="space-y-1 text-sm">
                {uploaded.map((f) => (
                  <li key={f.id} className="flex justify-between rounded border px-3 py-2">
                    <a href={`/api/files/${f.id}`} className="truncate text-accent hover:underline">
                      {f.name}
                    </a>
                    {f.scan === "pending" ? <span className="text-xs text-muted-foreground">{dict.workspace.scanPending}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Alert>{t.filesNeedDraft}</Alert>
          )}
        </section>

        <section className={panel("review")}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="accept_terms" className="mt-1" />
            <span>{t.consentTerms}</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="accept_acceptable_use" className="mt-1" />
            <span>{t.consentUse}</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent_ai" className="mt-1" />
            <span className="text-muted-foreground">{t.consentAi}</span>
          </label>
          <Button type="submit" name="intent" value="submit" variant="accent" disabled={busy} aria-busy={submitting}>
            {t.submitOrder}
          </Button>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="ghost" disabled={index === 0} onClick={() => setStep(STEPS[index - 1]!)}>
            {dict.actions.back}
          </Button>
          <Button type="submit" name="intent" value="save" variant="outline" disabled={busy} aria-busy={saving}>
            {dict.actions.saveDraft}
          </Button>
          {index < STEPS.length - 1 ? <Button onClick={() => setStep(STEPS[index + 1]!)}>{dict.actions.next}</Button> : null}
          {orderId ? (
            <Button variant="link" className="ms-auto text-destructive" type="submit" name="intent" value="delete" disabled={busy}>
              {t.deleteDraft}
            </Button>
          ) : null}
        </div>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t.estimate}</CardTitle>
            {service ? <p className="text-sm text-muted-foreground">{service.name}</p> : null}
          </CardHeader>
          <CardContent>
            <EstimateView result={estimate} dict={dict} locale={locale} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
