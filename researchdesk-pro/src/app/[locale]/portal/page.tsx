import Link from "next/link";
import { revalidatePath } from "next/cache";
import { StatusBadge } from "@/components/site/status-badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { fill, localized } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

async function markAllRead() {
  "use server";
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/[locale]/portal", "page");
}

export default async function PortalPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireViewer(locale);
  const tz = viewer.profile?.timezone ?? "Asia/Riyadh";
  const supabase = await serverClient();
  const [{ data: orders }, { data: notifications }, { data: unread }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, ref, title, status, deadline, updated_at, conversations(id), services(name_en, name_ar)")
      .eq("customer_id", viewer.user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("notifications").select("id, type, payload, link, read_at, created_at").eq("user_id", viewer.user.id).order("created_at", { ascending: false }).limit(15),
    supabase.rpc("unread_counts"),
  ]);
  const unreadBy = new Map(((unread ?? []) as Array<{ conversation_id: string; unread: number }>).map((u) => [u.conversation_id, Number(u.unread)]));
  const templates = dict.notifications as Record<string, string>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{dict.portal.title}</h1>
          <Link href={`/${locale}/portal/orders/new`} className={buttonClass("accent")}>
            {dict.portal.newOrder}
          </Link>
        </div>
        {!orders?.length ? (
          <Card>
            <CardContent className="pt-5 text-muted-foreground">{dict.portal.empty}</CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>{dict.portal.columns.ref}</Th>
                  <Th>{dict.portal.columns.title}</Th>
                  <Th>{dict.portal.columns.status}</Th>
                  <Th>{dict.portal.columns.deadline}</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const conv = (o.conversations as unknown as Array<{ id: string }> | null)?.[0];
                  const count = conv ? (unreadBy.get(conv.id) ?? 0) : 0;
                  return (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/${locale}/portal/orders/${o.id}`} className="font-mono text-accent hover:underline">
                          {o.ref}
                        </Link>
                        {count ? (
                          <span className="ms-2 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">
                            {count} {dict.portal.unread}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="block">{o.title || "—"}</span>
                        <span className="text-xs text-muted-foreground">{localized((o.services as unknown as object) ?? {}, "name", locale)}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={o.status} dict={dict} />
                      </Td>
                      <Td className="whitespace-nowrap">{formatDateTime(o.deadline, locale, tz)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
      <aside>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{dict.portal.notifications}</CardTitle>
            <form action={markAllRead}>
              <button className="text-xs text-accent hover:underline" type="submit">
                {dict.portal.markAllRead}
              </button>
            </form>
          </CardHeader>
          <CardContent>
            {!notifications?.length ? <p className="text-sm text-muted-foreground">{dict.portal.noNotifications}</p> : null}
            <ul className="space-y-2 text-sm">
              {notifications?.map((n) => {
                const payload = { ...(n.payload as Record<string, string>) };
                if (payload.to) payload.to = (dict.status as Record<string, string>)[payload.to] ?? payload.to;
                return (
                  <li key={n.id} className={n.read_at ? "text-muted-foreground" : "font-medium"}>
                    <Link href={`/${locale}${n.link ?? "/portal"}`} className="hover:underline">
                      {fill(templates[n.type] ?? dict.notifications.message, payload)}
                    </Link>
                    <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(n.created_at, locale, tz)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
