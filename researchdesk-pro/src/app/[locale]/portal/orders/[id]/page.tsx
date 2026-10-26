import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { answerRequirementAction, customerTransitionAction, quoteDecisionAction } from "@/actions/orders";
import { startCheckoutAction } from "@/actions/payments";
import { ChatPanel } from "@/components/orders/chat-panel";
import { FileUploader } from "@/components/orders/file-uploader";
import { OrderWizard } from "@/components/orders/order-wizard";
import { RevisionForm } from "@/components/orders/revision-form";
import { StatusBadge } from "@/components/site/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth";
import { configValue } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fill, getDictionary, isLocale, localized, type Dictionary, type Locale } from "@/lib/i18n";
import { loadOrderWorkspace, type OrderWorkspace } from "@/lib/order-data";
import { nextStatuses, type OrderStatus } from "@/lib/orders/status";
import { one, type SearchParams } from "@/lib/page";
import { availableAdapters } from "@/lib/payments/registry";
import type { EstimateResult } from "@/lib/pricing/engine";
import { utcToWallTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { wizardCatalog } from "@/lib/wizard-data";

const TABS = ["overview", "messages", "files", "billing", "revisions", "timeline"] as const;
type Tab = (typeof TABS)[number];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dict = getDictionary(locale);
  const viewer = await requireViewer(locale, `/${locale}/portal/orders/${id}`);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const sp = await searchParams;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ws = await loadOrderWorkspace(id);
  if (!ws || ws.order.customer_id !== viewer.user.id) notFound();
  const { order } = ws;

  if (order.status === "draft") {
    const catalog = await wizardCatalog(locale);
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold">
          {dict.wizard.editTitle} <span className="font-mono text-base text-muted-foreground">{order.ref}</span>
        </h1>
        <OrderWizard
          locale={locale}
          dict={dict}
          {...catalog}
          order={{ ...order, deadline_local: order.deadline ? utcToWallTime(new Date(order.deadline), order.timezone) : "" }}
          files={ws.files.filter((f) => f.kind === "attachment").map((f) => ({ id: f.id, name: f.original_name, scan: f.scan_status }))}
          defaultTimezone={tz}
          defaultCurrency={order.currency}
          initialEstimate={(order.estimate_breakdown as EstimateResult | null) ?? null}
        />
      </>
    );
  }

  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "") ? (one(sp.tab) as Tab) : "overview";
  const payment = one(sp.payment);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{order.ref}</p>
          <h1 className="text-2xl font-semibold">{order.title}</h1>
          <p className="text-sm text-muted-foreground">{localized(ws.service, "name", locale)}</p>
        </div>
        <StatusBadge status={order.status} dict={dict} />
      </header>

      {one(sp.submitted) ? <Alert tone="success">{dict.wizard.submitted}</Alert> : null}
      {payment === "returned" && order.status === "awaiting_payment" ? <Alert>{dict.workspace.paymentPending}</Alert> : null}
      {payment && ["failed", "unavailable", "rate_limited"].includes(payment) ? <Alert tone="error">{dict.errors.generic}</Alert> : null}

      <nav aria-label={order.ref} className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn("shrink-0 border-b-2 px-3 py-2 text-sm", t === tab ? "border-accent font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {dict.workspace.tabs[t]}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview ws={ws} dict={dict} locale={locale} tz={tz} /> : null}
      {tab === "messages" && ws.conversationId ? (
        <ChatPanel
          conversationId={ws.conversationId}
          orderId={order.id}
          me={viewer.user.id}
          myKind="customer"
          dict={dict}
          locale={locale}
          timezone={tz}
          initialMessages={ws.messages}
          initialReads={ws.reads}
          fileNames={Object.fromEntries(ws.files.map((f) => [f.id, f.original_name]))}
        />
      ) : null}
      {tab === "files" ? <Files ws={ws} dict={dict} locale={locale} tz={tz} /> : null}
      {tab === "billing" ? <Billing ws={ws} dict={dict} locale={locale} tz={tz} /> : null}
      {tab === "revisions" ? <Revisions ws={ws} dict={dict} locale={locale} tz={tz} /> : null}
      {tab === "timeline" ? <Timeline ws={ws} dict={dict} locale={locale} tz={tz} /> : null}
    </div>
  );
}

interface SectionProps {
  ws: OrderWorkspace;
  dict: Dictionary;
  locale: Locale;
  tz: string;
}

function Overview({ ws, dict, locale, tz }: SectionProps) {
  const { order } = ws;
  const t = dict.workspace;
  const open = ws.requirements.filter((r) => r.status === "open");
  const actions = nextStatuses("customer", order.status as OrderStatus).filter((s) => s === "cancelled" || s === "completed");
  const details: Array<[string, string | null]> = [
    [t.deadline, formatDateTime(order.deadline, locale, tz)],
    [dict.wizard.discipline, order.discipline],
    [dict.wizard.intendedUse, order.intended_use ? dict.wizard.intendedUses[order.intended_use as keyof typeof dict.wizard.intendedUses] : null],
    [dict.wizard.citationStyle, order.citation_style ? dict.wizard.citationStyles[order.citation_style as keyof typeof dict.wizard.citationStyles] : null],
    [dict.wizard.language, dict.wizard.languages[order.language as keyof typeof dict.wizard.languages]],
    [dict.units[`quantity_${ws.service.unit}` as keyof typeof dict.units], String(ws.service.unit === "word" ? (order.word_count ?? "—") : (order.page_count ?? "—"))],
    [t.created, formatDateTime(order.created_at, locale, tz)],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t.clarifications}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ws.requirements.length === 0 ? <p className="text-sm text-muted-foreground">{t.noClarifications}</p> : null}
          {ws.requirements.map((r) => (
            <div key={r.id} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{r.question}</p>
              {r.status === "open" ? (
                <form action={answerRequirementAction} className="space-y-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="order_id" value={order.id} />
                  <input type="hidden" name="requirement_id" value={r.id} />
                  <Textarea name="answer" required maxLength={10000} rows={3} aria-label={t.answer} placeholder={t.answer} />
                  <Button type="submit" size="sm">
                    {dict.actions.send}
                  </Button>
                </form>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  <span className="text-xs text-success">{t.answered}: </span>
                  {r.answer}
                </p>
              )}
            </div>
          ))}
          {open.length ? <Alert tone="warning">{dict.status.needs_clarification}</Alert> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.requirements}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {order.instructions ? <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{order.instructions}</p> : null}
          <div className="flex flex-wrap gap-2">
            {actions.map((to) => (
              <form key={to} action={customerTransitionAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="to" value={to} />
                <Button type="submit" variant={to === "cancelled" ? "outline" : "accent"} size="sm">
                  {to === "cancelled" ? t.cancelOrder : t.markComplete}
                </Button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Files({ ws, dict, locale, tz }: SectionProps) {
  const t = dict.workspace;
  const attachments = ws.files.filter((f) => f.kind !== "deliverable");
  const byFile = new Map(ws.files.map((f) => [f.id, f]));
  const terminal = ["completed", "cancelled", "refunded"].includes(ws.order.status);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t.deliverables}</CardTitle>
        </CardHeader>
        <CardContent>
          {ws.versions.length === 0 ? <p className="text-sm text-muted-foreground">{t.noFiles}</p> : null}
          <ul className="space-y-2">
            {ws.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {t.version} {v.version}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(v.delivered_at, locale, tz)}</p>
                  {v.note ? <p className="mt-1 text-xs">{v.note}</p> : null}
                </div>
                <a href={`/api/files/${v.file_id}`} className={buttonClass("outline", "sm")}>
                  {dict.actions.download}
                </a>
                <span className="sr-only">{byFile.get(v.file_id)?.original_name}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.attachments}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!terminal ? <FileUploader orderId={ws.order.id} purpose="attachment" label={dict.actions.upload} locale={locale} /> : null}
          {attachments.length === 0 ? <p className="text-sm text-muted-foreground">{t.noFiles}</p> : null}
          <ul className="space-y-1 text-sm">
            {attachments.map((f) => (
              <li key={f.id} className="flex justify-between gap-2 rounded border px-3 py-2">
                <a href={`/api/files/${f.id}`} className="truncate text-accent hover:underline">
                  {f.original_name}
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(f.created_at, locale, tz)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

async function Billing({ ws, dict, locale, tz }: SectionProps) {
  const t = dict.workspace;
  const adapters = availableAdapters();
  const quote = ws.quotes.find((q) => q.status === "sent" && !q.revision_id) ?? ws.quotes.find((q) => q.status === "sent");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t.quote}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {ws.quotes.length === 0 ? <p className="text-muted-foreground">{t.noQuote}</p> : null}
          {ws.quotes.map((q) => (
            <div key={q.id} className={cn("rounded-md border p-3", q.status === "sent" && "border-accent")}>
              <div className="flex justify-between">
                <strong>{formatMoney(q.total, q.currency, locale)}</strong>
                <span className="text-xs text-muted-foreground">{q.status}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.deposit}: {q.deposit_percent}% · {t.quoteValidUntil} {formatDateTime(q.valid_until, locale, tz)}
              </p>
              {q.delivery_estimate ? (
                <p className="text-xs">
                  {dict.admin.deliveryEstimate}: {formatDateTime(q.delivery_estimate, locale, tz)}
                </p>
              ) : null}
              {q.notes ? <p className="mt-2 whitespace-pre-wrap">{q.notes}</p> : null}
              {q.id === quote?.id ? (
                new Date(q.valid_until) <= new Date() ? (
                  <Alert tone="warning" className="mt-2">
                    {t.quoteExpired}
                  </Alert>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {(["accept", "decline"] as const).map((decision) => (
                      <form key={decision} action={quoteDecisionAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="order_id" value={ws.order.id} />
                        <input type="hidden" name="quote_id" value={q.id} />
                        <input type="hidden" name="decision" value={decision} />
                        <Button type="submit" size="sm" variant={decision === "accept" ? "accent" : "outline"}>
                          {decision === "accept" ? t.acceptQuote : t.declineQuote}
                        </Button>
                      </form>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.invoice}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {ws.invoices.filter((i) => i.status !== "void").map((inv) => {
            const balance = Number(inv.total) - Number(inv.amount_paid);
            const payable = ["open", "partially_paid"].includes(inv.status) && balance > 0;
            const depositFirst = Number(inv.amount_paid) === 0 && Number(inv.deposit_amount) < Number(inv.total);
            return (
              <div key={inv.id} className="space-y-2 rounded-md border p-3">
                <div className="flex justify-between font-mono text-xs text-muted-foreground">
                  <span>{inv.number}</span>
                  <span>{inv.status}</span>
                </div>
                <dl className="grid grid-cols-2 gap-1">
                  <dt>{dict.wizard.total}</dt>
                  <dd className="text-end">{formatMoney(inv.total, inv.currency, locale)}</dd>
                  <dt>{t.paid}</dt>
                  <dd className="text-end">{formatMoney(inv.amount_paid, inv.currency, locale)}</dd>
                  <dt className="font-medium">{t.balance}</dt>
                  <dd className="text-end font-medium">{formatMoney(balance, inv.currency, locale)}</dd>
                </dl>
                {payable && adapters.length ? (
                  <form action={startCheckoutAction} className="space-y-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="order_id" value={ws.order.id} />
                    <input type="hidden" name="invoice_id" value={inv.id} />
                    <input type="hidden" name="idempotency_key" value={randomUUID()} />
                    <label className="block text-xs text-muted-foreground" htmlFor={`provider-${inv.id}`}>
                      {t.choosePayment}
                    </label>
                    <Select id={`provider-${inv.id}`} name="provider">
                      {adapters.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id === "sandbox" ? "Sandbox (test only)" : a.id} — {a.methods.join(", ")}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      {depositFirst ? (
                        <Button type="submit" name="kind" value="deposit" variant="accent" size="sm">
                          {t.payDeposit} ({formatMoney(inv.deposit_amount, inv.currency, locale)})
                        </Button>
                      ) : null}
                      <Button type="submit" name="kind" value="full" variant={depositFirst ? "outline" : "accent"} size="sm">
                        {Number(inv.amount_paid) > 0 ? t.payBalance : t.payFull} ({formatMoney(balance, inv.currency, locale)})
                      </Button>
                    </div>
                  </form>
                ) : null}
                {payable && !adapters.length ? <p className="text-xs text-muted-foreground">{dict.pricing.none}</p> : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">{dict.pricing.noBankTransfer}</p>
          {ws.payments.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>{t.payments}</Th>
                  <Th />
                  <Th className="text-end" />
                </tr>
              </thead>
              <tbody>
                {ws.payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatDateTime(p.paid_at ?? p.created_at, locale, tz)}</Td>
                    <Td>
                      {p.status} {p.method ? `· ${p.method}` : ""}
                    </Td>
                    <Td className="text-end">{formatMoney(p.amount, p.currency, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
          {ws.refunds.filter((r) => r.status === "succeeded").map((r) => (
            <p key={r.id} className="text-xs">
              {t.refunds}: {formatMoney(r.amount, r.currency, locale)} · {formatDateTime(r.completed_at, locale, tz)}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function Revisions({ ws, dict, locale, tz }: SectionProps) {
  const t = dict.workspace;
  const windowDays = await configValue("revision_window_days", 14);
  const used = ws.revisions.filter((r) => !r.additional_scope && r.status !== "declined").length;
  const hasOpen = ws.revisions.some((r) => ["requested", "approved", "quoted", "in_progress"].includes(r.status));
  const deliveredAt = ws.order.delivered_at ? new Date(ws.order.delivered_at) : null;
  const inWindow = deliveredAt && deliveredAt.getTime() + windowDays * 86_400_000 > Date.now();
  const canRequest = ["delivered", "completed"].includes(ws.order.status) && !hasOpen && inWindow;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{dict.workspace.tabs.revisions}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t.revisionIncluded}: {ws.order.revisions_included} · {t.revisionUsed}: {used}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {ws.revisions.length === 0 ? <p className="text-muted-foreground">{t.noRevisions}</p> : null}
          {ws.revisions.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex justify-between">
                <strong>#{r.number}</strong>
                <span className="text-xs">{t.revisionStatus[r.status as keyof typeof t.revisionStatus]}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{r.description}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.requested_changes}</p>
              {r.decision_note ? <p className="mt-1 text-xs">{r.decision_note}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at, locale, tz)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.revisionTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{fill(t.revisionWindow, { days: windowDays })}</p>
        </CardHeader>
        <CardContent>
          {canRequest ? (
            <RevisionForm orderId={ws.order.id} locale={locale} dict={dict} timezone={tz} additional={used >= ws.order.revisions_included} />
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Timeline({ ws, dict, locale, tz }: SectionProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        {ws.history.length === 0 ? <p className="text-sm text-muted-foreground">{dict.workspace.timelineEmpty}</p> : null}
        <ol className="relative space-y-4 border-s ps-6">
          {ws.history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -start-[1.85rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-accent" aria-hidden />
              <p className="text-sm font-medium">{dict.status[h.to_status as OrderStatus]}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(h.created_at, locale, tz)} · {h.actor_kind === "admin" ? dict.chat.owner : h.actor_kind === "customer" ? dict.chat.you : dict.chat.system}
              </p>
              {h.note ? <p className="text-xs">{h.note}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
