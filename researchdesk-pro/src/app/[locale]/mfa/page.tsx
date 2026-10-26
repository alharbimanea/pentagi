import { MfaPanel } from "@/components/auth/mfa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewer, safeNext } from "@/lib/auth";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";

export default async function MfaPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireViewer(locale, `/${locale}/mfa`);
  const next = safeNext(one((await searchParams).next), `/${locale}/portal/settings`);
  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{dict.auth.mfaTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{viewer.isAdminRole ? dict.auth.mfaRequired : dict.auth.mfaIntro}</p>
        </CardHeader>
        <CardContent>
          <MfaPanel dict={dict} next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
