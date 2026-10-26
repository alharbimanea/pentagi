import { ForgotPasswordForm } from "@/components/auth/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function ForgotPasswordPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{dict.auth.forgotTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm locale={locale} dict={dict} />
        </CardContent>
      </Card>
    </div>
  );
}
