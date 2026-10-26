import { ResetPasswordForm } from "@/components/auth/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function ResetPasswordPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  await requireViewer(locale);
  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{dict.auth.resetTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm locale={locale} dict={dict} />
        </CardContent>
      </Card>
    </div>
  );
}
