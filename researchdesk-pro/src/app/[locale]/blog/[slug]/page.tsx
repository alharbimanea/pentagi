import { notFound } from "next/navigation";
import { formatDate } from "@/lib/format";
import { getDictionary, isLocale, localized } from "@/lib/i18n";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Bodies are rendered as text paragraphs, never as HTML, so an article
// cannot carry script even if an admin session were compromised.
export default async function PostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const supabase = await serverClient();
  const { data: post } = await supabase.from("posts").select("*").eq("slug", slug).maybeSingle();
  if (!post || !post.published_at) notFound();
  const body = localized(post, "body", locale);
  return (
    <article className="container max-w-3xl py-12">
      <p className="text-sm text-muted-foreground">
        {dict.blog.title} · {formatDate(post.published_at, locale)}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{localized(post, "title", locale)}</h1>
      <div className="mt-8 space-y-4 leading-relaxed">
        {body.split(/\n{2,}/).map((para, i) =>
          para.startsWith("## ") ? (
            <h2 key={i} className="pt-4 text-xl font-semibold">
              {para.slice(3)}
            </h2>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ),
        )}
      </div>
    </article>
  );
}
