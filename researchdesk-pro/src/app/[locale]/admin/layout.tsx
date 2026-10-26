import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireAdmin(locale);
  const nav = Object.entries(dict.admin.nav).map(([key, label]) => [key === "dashboard" ? "" : `/${key}`, label] as const);
  return (
    <div className="container py-8">
      <nav aria-label={dict.nav.admin} className="mb-6 flex flex-wrap gap-1 border-b pb-2 text-sm">
        {nav.map(([href, label]) => (
          <Link key={href} href={`/${locale}/admin${href}`} className="rounded-md px-3 py-1.5 hover:bg-muted">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
