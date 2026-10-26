import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireViewer(locale, `/${locale}/portal`);
  return (
    <div className="container py-8">
      <nav aria-label={dict.nav.portal} className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href={`/${locale}/portal`} className="rounded-md px-3 py-1.5 hover:bg-muted">
          {dict.portal.title}
        </Link>
        <Link href={`/${locale}/portal/orders/new`} className="rounded-md px-3 py-1.5 hover:bg-muted">
          {dict.portal.newOrder}
        </Link>
        <Link href={`/${locale}/portal/settings`} className="rounded-md px-3 py-1.5 hover:bg-muted">
          {dict.nav.settings}
        </Link>
      </nav>
      {children}
    </div>
  );
}
