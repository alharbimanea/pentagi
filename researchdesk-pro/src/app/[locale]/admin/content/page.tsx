import Link from "next/link";
import { savePostAction } from "@/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { localized } from "@/lib/i18n";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

export default async function ContentAdmin({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireAdmin(locale);
  const edit = one((await searchParams).edit);
  const supabase = await serverClient();
  const { data: posts } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
  const post = edit && edit !== "new" ? posts?.find((p) => p.id === edit) : null;
  const a = dict.admin;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{a.contentTitle}</CardTitle>
          <Link href="?edit=new" className={buttonClass("outline", "sm")}>
            {a.newPost}
          </Link>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {posts?.map((p) => (
              <li key={p.id}>
                <Link href={`?edit=${p.id}`} className="text-accent hover:underline">
                  {localized(p, "title", locale)}
                </Link>
                <span className="block text-xs text-muted-foreground">{p.published_at ? `${a.published} ${formatDate(p.published_at, locale)}` : "draft"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {edit ? (
        <Card>
          <CardContent className="pt-5">
            <ActionForm action={savePostAction} hidden={{ locale, id: post?.id ?? "" }} className="space-y-4">
              <Field label={a.slug} htmlFor="slug">
                <Input id="slug" name="slug" required pattern="[a-z0-9-]{2,80}" defaultValue={post?.slug ?? ""} dir="ltr" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={a.titleEn} htmlFor="title_en">
                  <Input id="title_en" name="title_en" required defaultValue={post?.title_en ?? ""} dir="ltr" />
                </Field>
                <Field label={a.titleAr} htmlFor="title_ar">
                  <Input id="title_ar" name="title_ar" required defaultValue={post?.title_ar ?? ""} dir="rtl" />
                </Field>
                <Field label={a.excerptEn} htmlFor="excerpt_en">
                  <Textarea id="excerpt_en" name="excerpt_en" rows={2} defaultValue={post?.excerpt_en ?? ""} dir="ltr" />
                </Field>
                <Field label={a.excerptAr} htmlFor="excerpt_ar">
                  <Textarea id="excerpt_ar" name="excerpt_ar" rows={2} defaultValue={post?.excerpt_ar ?? ""} dir="rtl" />
                </Field>
                <Field label={a.bodyEn} htmlFor="body_en">
                  <Textarea id="body_en" name="body_en" rows={14} defaultValue={post?.body_en ?? ""} dir="ltr" />
                </Field>
                <Field label={a.bodyAr} htmlFor="body_ar">
                  <Textarea id="body_ar" name="body_ar" rows={14} defaultValue={post?.body_ar ?? ""} dir="rtl" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="publish" defaultChecked={Boolean(post?.published_at)} /> {a.publish}
              </label>
              <SubmitButton>{dict.actions.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
