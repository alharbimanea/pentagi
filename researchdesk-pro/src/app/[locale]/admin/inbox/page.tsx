import Link from "next/link";
import { updateConversationAction, updateTicketAction } from "@/actions/admin";
import type { ChatMessage } from "@/actions/messages";
import { ChatPanel } from "@/components/orders/chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function InboxPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireAdmin(locale);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const sp = await searchParams;
  const selected = one(sp.c);
  const supabase = await serverClient();
  const [{ data: conversations }, { data: unread }, { data: tickets }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, order_id, channel, subject, status, priority, last_message_at, customer_id, profiles!conversations_customer_id_fkey(email, full_name), orders(ref)")
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(100),
    supabase.rpc("unread_counts"),
    supabase.from("support_tickets").select("*").neq("status", "closed").order("created_at", { ascending: false }).limit(50),
  ]);
  const unreadBy = new Map(((unread ?? []) as Array<{ conversation_id: string; unread: number }>).map((u) => [u.conversation_id, Number(u.unread)]));
  const current = conversations?.find((c) => c.id === selected);
  let messages: ChatMessage[] = [];
  let reads: Array<{ user_id: string; last_read_at: string }> = [];
  if (current) {
    const [m, r] = await Promise.all([
      supabase.from("messages").select("id, sender_id, sender_kind, body, file_id, created_at, delivery_status").eq("conversation_id", current.id).order("created_at").limit(500),
      supabase.from("conversation_reads").select("user_id, last_read_at").eq("conversation_id", current.id),
    ]);
    messages = (m.data ?? []) as ChatMessage[];
    reads = r.data ?? [];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{dict.admin.inbox}</h1>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <ul className="divide-y">
            {conversations?.map((c) => {
              const who = c.profiles as unknown as { email: string; full_name: string | null } | null;
              const ref = (c.orders as unknown as { ref: string } | null)?.ref;
              const n = unreadBy.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`?c=${c.id}`} className={cn("block p-3 text-sm hover:bg-muted", c.id === selected && "bg-muted")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{who?.full_name ?? who?.email ?? dict.admin.unlinked}</span>
                      {n ? <span className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{n}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Badge>{c.channel}</Badge>
                      {ref ? <span className="font-mono">{ref}</span> : null}
                      {c.priority !== "normal" ? <Badge tone="warning">{c.priority}</Badge> : null}
                      <span>{formatDateTime(c.last_message_at, locale, tz)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="space-y-4">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {current.order_id ? (
                  <Link className="text-accent underline" href={`/${locale}/admin/orders/${current.order_id}`}>
                    {(current.orders as unknown as { ref: string } | null)?.ref}
                  </Link>
                ) : null}
                {!current.customer_id ? <Badge tone="warning">{dict.admin.unlinked}</Badge> : null}
                <form action={updateConversationAction} className="ms-auto flex gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="conversation_id" value={current.id} />
                  <Select name="priority" defaultValue={current.priority} aria-label={dict.admin.priority} className="h-8 w-auto">
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                  <Select name="status" defaultValue={current.status} aria-label={dict.admin.filters.status} className="h-8 w-auto">
                    {["open", "pending", "closed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="outline">
                    {dict.actions.save}
                  </Button>
                </form>
              </div>
              <ChatPanel
                conversationId={current.id}
                orderId={current.order_id}
                me={viewer.user.id}
                myKind="admin"
                dict={dict}
                locale={locale}
                timezone={tz}
                initialMessages={messages}
                initialReads={reads}
                fileNames={{}}
              />
            </>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{dict.nav.contact}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {tickets?.length ? null : <p className="text-muted-foreground">—</p>}
              {tickets?.map((t) => (
                <div key={t.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{t.subject}</strong>
                    <span className="text-xs text-muted-foreground">{formatDateTime(t.created_at, locale, tz)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.name} &lt;
                    <a className="underline" href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject}`)}`}>
                      {t.email}
                    </a>
                    &gt; {t.customer_id ? "· ✓" : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{t.body}</p>
                  <form action={updateTicketAction} className="mt-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="ticket_id" value={t.id} />
                    <input type="hidden" name="status" value="closed" />
                    <Button type="submit" size="sm" variant="ghost">
                      {dict.actions.close}
                    </Button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
