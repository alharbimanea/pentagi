import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function AboutPage({ params }: { params: LocaleParams }) {
  const { dict } = await resolveLocale(params);
  return (
    <div className="container max-w-3xl space-y-4 py-12">
      <h1 className="text-3xl font-semibold">{dict.about.title}</h1>
      {dict.about.body.map((p) => (
        <p key={p} className="text-muted-foreground">
          {p}
        </p>
      ))}
    </div>
  );
}
