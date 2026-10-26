import Link from "next/link";
import { formatDate } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BlogPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const supabase = await serverClient();
  const { data } = await supabase
    .from("posts")
    .select("slug, title_en, title_ar, excerpt_en, excerpt_ar, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(50);
  const posts = data ?? [];
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-3xl font-semibold">{dict.blog.title}</h1>
      <p className="mt-2 text-muted-foreground">{dict.blog.intro}</p>
      {posts.length === 0 ? <p className="mt-8 text-muted-foreground">{dict.blog.empty}</p> : null}
      <ul className="mt-8 space-y-6">
        {posts.map((p) => (
          <li key={p.slug} className="border-b pb-6">
            <p className="text-xs text-muted-foreground">{formatDate(p.published_at, locale)}</p>
            <h2 className="mt-1 text-xl font-semibold">
              <Link href={`/${locale}/blog/${p.slug}`} className="hover:text-accent">
                {localized(p, "title", locale)}
              </Link>
            </h2>
            <p className="mt-1 text-muted-foreground">{localized(p, "excerpt", locale)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
