import { notFound } from "next/navigation";
import {
  addInternalNoteAction,
  adminTransitionAction,
  aiSummaryAction,
  askQuestionAction,
  decideRefundAction,
  deliverAction,
  requestRefundAction,
  revisionDecisionAction,
  sendQuoteAction,
  startRevisionQcAction,
} from "@/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { ChatPanel } from "@/components/orders/chat-panel";
import { EstimateView } from "@/components/orders/estimate-view";
import { FileUploader } from "@/components/orders/file-uploader";
import { StatusBadge } from "@/components/site/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th } from "@/components/ui/table";
import { aiConfigured } from "@/lib/ai/assist";
import { requireAdmin } from "@/lib/auth";
import { configValue } from "@/lib/config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getDictionary, isLocale, localized, type Locale } from "@/lib/i18n";
import { loadOrderWorkspace } from "@/lib/order-data";
import { missingForSubmission } from "@/lib/orders/schema";
import { nextStatuses, type OrderStatus } from "@/lib/orders/status";
import type { EstimateResult } from "@/lib/pricing/engine";
import { serverClient } from "@/lib/supabase/server";

export default async function AdminOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const locale: Locale = raw;
  const dict = getDictionary(locale);
  const viewer = await requireAdmin(locale);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const ws = await loadOrderWorkspace(id);
  if (!ws) notFound();
  const { order } = ws;
  const status = order.status as OrderStatus;
  const supabase = await serverClient();
  const [{ data: customer }, { data: notes }, { data: aiConsent }, aiEnabled, validDays] = await Promise.all([
    supabase.from("profiles").select("email, full_name, phone, locale, timezone").eq("id", order.customer_id).single(),
    supabase.from("order_internal_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("consent_records").select("granted").eq("order_id", id).eq("kind", "ai_processing").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    configValue("ai_assist_enabled", false),
    configValue("quote_validity_days", 7),
  ]);

  const a = dict.admin;
  const hidden = { locale, order_id: order.id };
  const missing = missingForSubmission(order, ws.service.unit);
  const transitions = nextStatuses("admin", status);
  const deliverables = ws.files.filter((f) => f.kind === "deliverable");
  const delivered = new Set(ws.versions.map((v) => v.file_id));
  const openRevision = ws.revisions.find((r) => ["requested", "quoted"].includes(r.status));
  const paidPayments = ws.payments.filter((p) => ["paid", "partially_refunded"].includes(p.status));
  const estimate = order.estimate_breakdown as EstimateResult | null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{order.ref}</p>
          <h1 className="text-2xl font-semibold">{order.title}</h1>
          <p className="text-sm text-muted-foreground">
            {localized(ws.service, "name", locale)} · {customer?.full_name ?? "—"} &lt;{customer?.email}&gt; · {customer?.timezone}
          </p>
        </div>
        <StatusBadge status={status} dict={dict} />
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{dict.workspace.requirements}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">{dict.workspace.deadline}</dt>
              <dd>
                {formatDateTime(order.deadline, locale, tz)} <span className="text-xs text-muted-foreground">({order.timezone})</span>
              </dd>
              <dt className="text-muted-foreground">{dict.wizard.intendedUse}</dt>
              <dd>{order.intended_use ? dict.wizard.intendedUses[order.intended_use as keyof typeof dict.wizard.intendedUses] : "—"}</dd>
              <dt className="text-muted-foreground">{dict.wizard.level}</dt>
              <dd>
                {order.level ?? "—"} / {order.complexity ?? "—"}
              </dd>
              <dt className="text-muted-foreground">{dict.units[`quantity_${ws.service.unit}` as keyof typeof dict.units]}</dt>
              <dd>{ws.service.unit === "word" ? order.word_count : order.page_count}</dd>
              <dt className="text-muted-foreground">{dict.wizard.citationStyle}</dt>
              <dd>{order.citation_style ?? "—"}</dd>
              <dt className="text-muted-foreground">{dict.wizard.addons}</dt>
              <dd>{order.addons?.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">{dict.wizard.promo}</dt>
              <dd>{order.promo_code ?? "—"}</dd>
            </dl>
            {[order.scope, order.methodology, order.references_notes, order.instructions].filter(Boolean).map((text, i) => (
              <p key={i} className="whitespace-pre-wrap rounded-md bg-muted p-3">
                {text}
              </p>
            ))}
            <div>
              <p className="font-medium">{a.missingInfo}</p>
              {missing.length ? (
                <ul className="list-disc ps-5 text-warning">
                  {missing.map((m) => (
                    <li key={m}>{dict.wizard.missingFields[m]}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{a.nothingMissing}</p>
              )}
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 font-medium">{a.estimate}</p>
              <EstimateView result={estimate} dict={dict} locale={locale} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{a.moveTo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {transitions.length ? (
                <ActionForm action={adminTransitionAction} hidden={hidden}>
                  <div className="flex flex-wrap gap-2">
                    <Select name="to" aria-label={a.moveTo} className="w-auto">
                      {transitions.map((s) => (
                        <option key={s} value={s}>
                          {dict.status[s]}
                        </option>
                      ))}
                    </Select>
                    <Input name="note" placeholder={a.note} aria-label={a.note} className="min-w-40 flex-1" maxLength={2000} />
                    <SubmitButton size="md">{dict.actions.confirm}</SubmitButton>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
              {status === "revision_in_progress" ? (
                <ActionForm action={startRevisionQcAction} hidden={hidden}>
                  <SubmitButton variant="outline">{a.startQc}</SubmitButton>
                </ActionForm>
              ) : null}
              {!["completed", "cancelled", "refunded", "draft"].includes(status) ? (
                <ActionForm action={askQuestionAction} hidden={hidden}>
                  <Field label={a.askQuestion} htmlFor="question">
                    <Textarea id="question" name="question" required maxLength={2000} rows={2} />
                  </Field>
                  <SubmitButton variant="outline" size="sm">
                    {dict.actions.send}
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {ws.requirements.map((r) => (
                <div key={r.id} className="rounded border p-2 text-sm">
                  <p className="font-medium">{r.question}</p>
                  <p className="text-muted-foreground">{r.answer ?? `(${r.status})`}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {["submitted", "needs_clarification", "awaiting_quote", "awaiting_payment", "revision_requested"].includes(status) ? (
            <Card>
              <CardHeader>
                <CardTitle>{openRevision?.additional_scope ? a.revisionQuote : a.quoteForm}</CardTitle>
              </CardHeader>
              <CardContent>
                {status === "revision_requested" && !openRevision?.additional_scope ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ActionForm action={sendQuoteAction} hidden={{ ...hidden, revision_id: status === "revision_requested" ? (openRevision?.id ?? "") : "" }}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label={dict.wizard.currency} htmlFor="currency">
                        <Select id="currency" name="currency" defaultValue={order.currency}>
                          <option>SAR</option>
                          <option>USD</option>
                        </Select>
                      </Field>
                      <Field label={a.subtotal} htmlFor="subtotal">
                        <Input id="subtotal" name="subtotal" type="number" step="0.01" min="1" required defaultValue={estimate?.ok ? estimate.subtotal : ""} />
                      </Field>
                      <Field label={a.discount} htmlFor="discount_amount">
                        <Input id="discount_amount" name="discount_amount" type="number" step="0.01" min="0" defaultValue={estimate?.ok ? estimate.discount : 0} />
                      </Field>
                      <Field label={a.depositPercent} htmlFor="deposit_percent">
                        <Input id="deposit_percent" name="deposit_percent" type="number" min="10" max="100" defaultValue={100} />
                      </Field>
                      <Field label={a.validDays} htmlFor="valid_days">
                        <Input id="valid_days" name="valid_days" type="number" min="1" max="60" defaultValue={validDays} />
                      </Field>
                      <Field label={a.deliveryEstimate} htmlFor="delivery_estimate">
                        <Input id="delivery_estimate" name="delivery_estimate" type="datetime-local" />
                      </Field>
                    </div>
                    <Field label={a.quoteNotes} htmlFor="notes">
                      <Textarea id="notes" name="notes" maxLength={4000} rows={3} />
                    </Field>
                    <SubmitButton variant="accent">{a.sendQuote}</SubmitButton>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{dict.workspace.tabs.messages}</CardTitle>
          </CardHeader>
          <CardContent>
            {ws.conversationId ? (
              <ChatPanel
                conversationId={ws.conversationId}
                orderId={order.id}
                me={viewer.user.id}
                myKind="admin"
                dict={dict}
                locale={locale}
                timezone={tz}
                initialMessages={ws.messages}
                initialReads={ws.reads}
                fileNames={Object.fromEntries(ws.files.map((f) => [f.id, f.original_name]))}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{a.internalNotes}</CardTitle>
            <p className="text-xs text-muted-foreground">{a.internalNotesHint}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionForm action={addInternalNoteAction} hidden={hidden}>
              <Textarea name="body" required maxLength={20000} rows={3} aria-label={a.addNote} />
              <SubmitButton size="sm" variant="outline">
                {a.addNote}
              </SubmitButton>
            </ActionForm>
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">{a.aiSummary}</p>
              {!aiEnabled || !aiConfigured() ? (
                <p className="text-xs text-muted-foreground">{a.aiDisabled}</p>
              ) : !aiConsent?.granted ? (
                <p className="text-xs text-muted-foreground">{a.aiNoConsent}</p>
              ) : (
                <ActionForm action={aiSummaryAction} hidden={hidden}>
                  <SubmitButton size="sm" variant="ghost">
                    {a.aiGenerate}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
            <ul className="space-y-2 text-sm">
              {notes?.map((n) => (
                <li key={n.id} className="rounded-md bg-muted p-3">
                  {n.source === "ai" ? <p className="mb-1 text-xs font-medium text-warning">{a.aiLabel}</p> : null}
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at, locale, tz)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{a.deliver}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <FileUploader orderId={order.id} purpose="deliverable" label={a.uploadDeliverable} locale={locale} />
            {status === "quality_check" ? (
              deliverables.filter((f) => !delivered.has(f.id)).length ? (
                <ActionForm action={deliverAction} hidden={hidden}>
                  <Field label={a.deliverableFile} htmlFor="file_id">
                    <Select id="file_id" name="file_id">
                      {deliverables
                        .filter((f) => !delivered.has(f.id))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.original_name} · {f.scan_status}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label={a.deliveryNote} htmlFor="note">
                    <Textarea id="note" name="note" maxLength={2000} rows={2} />
                  </Field>
                  <SubmitButton variant="accent">{a.approveDelivery}</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-muted-foreground">{dict.workspace.noFiles}</p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">{dict.status.quality_check} →</p>
            )}
            <Table>
              <thead>
                <tr>
                  <Th>{dict.workspace.tabs.files}</Th>
                  <Th>Scan</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {ws.files.map((f) => (
                  <tr key={f.id}>
                    <Td>
                      <a href={`/api/files/${f.id}`} className="text-accent hover:underline">
                        {f.original_name}
                      </a>
                      <span className="block text-xs text-muted-foreground">
                        {f.kind}
                        {ws.versions.find((v) => v.file_id === f.id) ? ` · ${dict.workspace.version} ${ws.versions.find((v) => v.file_id === f.id)?.version}` : ""}
                      </span>
                    </Td>
                    <Td className={f.scan_status === "clean" ? "text-success" : "text-warning"}>{f.scan_status}</Td>
                    <Td className="text-xs text-muted-foreground">{formatDateTime(f.created_at, locale, tz)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dict.workspace.tabs.revisions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ws.revisions.length === 0 ? <p className="text-muted-foreground">{dict.workspace.noRevisions}</p> : null}
            {ws.revisions.map((r) => (
              <div key={r.id} className="space-y-2 rounded-md border p-3">
                <div className="flex justify-between">
                  <strong>
                    #{r.number} {r.additional_scope ? "· +scope" : ""}
                  </strong>
                  <span className="text-xs">{dict.workspace.revisionStatus[r.status as keyof typeof dict.workspace.revisionStatus]}</span>
                </div>
                <p className="whitespace-pre-wrap">{r.description}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{r.requested_changes}</p>
                {r.proposed_deadline ? <p className="text-xs">→ {formatDateTime(r.proposed_deadline, locale, tz)}</p> : null}
                {["requested", "quoted"].includes(r.status) ? (
                  <ActionForm action={revisionDecisionAction} hidden={{ ...hidden, revision_id: r.id }}>
                    <Input name="note" placeholder={a.note} aria-label={a.note} maxLength={2000} />
                    <div className="flex gap-2">
                      {!r.additional_scope ? (
                        <Button type="submit" name="decision" value="approve" size="sm" variant="accent">
                          {a.approveRevision}
                        </Button>
                      ) : null}
                      <Button type="submit" name="decision" value="decline" size="sm" variant="outline">
                        {a.declineRevision}
                      </Button>
                    </div>
                  </ActionForm>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict.workspace.tabs.billing}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm lg:grid-cols-2">
          <div className="space-y-2">
            {ws.quotes.map((q) => (
              <p key={q.id}>
                {formatMoney(q.total, q.currency, locale)} · {q.status} · {q.deposit_percent}% · {formatDateTime(q.created_at, locale, tz)}
                {q.revision_id ? " · revision" : ""}
              </p>
            ))}
            {ws.invoices.map((i) => (
              <p key={i.id} className="font-mono text-xs">
                {i.number} · {i.status} · {formatMoney(i.amount_paid, i.currency, locale)} / {formatMoney(i.total, i.currency, locale)} · refunded {formatMoney(i.amount_refunded, i.currency, locale)}
              </p>
            ))}
            <Table>
              <tbody>
                {ws.payments.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      {p.provider} · {p.kind}
                    </Td>
                    <Td>
                      {p.status}
                      {p.failure_reason ? <span className="block text-xs text-destructive">{p.failure_reason}</span> : null}
                    </Td>
                    <Td className="text-end">{formatMoney(p.amount, p.currency, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="space-y-3">
            <p className="font-medium">{a.refund}</p>
            {paidPayments.length ? (
              <ActionForm action={requestRefundAction} hidden={hidden}>
                <Select name="payment_id" aria-label={dict.workspace.payments}>
                  {paidPayments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.provider} · {formatMoney(p.amount, p.currency, locale)} · {formatDateTime(p.paid_at, locale, tz)}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="amount" type="number" step="0.01" min="0.01" required placeholder={a.refundAmount} aria-label={a.refundAmount} />
                  <Input name="reason" required minLength={3} maxLength={2000} placeholder={a.refundReason} aria-label={a.refundReason} />
                </div>
                <SubmitButton size="sm" variant="outline">
                  {a.requestRefund}
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {ws.refunds.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <p>
                  {formatMoney(r.amount, r.currency, locale)} · {r.status} · {r.reason}
                </p>
                {r.failure_reason ? <p className="text-xs text-destructive">{r.failure_reason}</p> : null}
                {r.status === "requested" ? (
                  <ActionForm action={decideRefundAction} hidden={{ ...hidden, refund_id: r.id }} className="mt-2">
                    <div className="flex gap-2">
                      <Button type="submit" name="decision" value="approve" size="sm" variant="destructive">
                        {a.approveRefund}
                      </Button>
                      <Button type="submit" name="decision" value="reject" size="sm" variant="outline">
                        {a.rejectRefund}
                      </Button>
                    </div>
                  </ActionForm>
                ) : null}
              </div>
            ))}
            <Alert tone="warning">{dict.pricing.noBankTransfer}</Alert>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict.workspace.tabs.timeline}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1 text-sm">
            {ws.history.map((h) => (
              <li key={h.id}>
                <span className="text-muted-foreground">{formatDateTime(h.created_at, locale, tz)}</span> · {h.from_status ? `${dict.status[h.from_status as OrderStatus]} → ` : ""}
                <strong>{dict.status[h.to_status as OrderStatus]}</strong> · {h.actor_kind}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
