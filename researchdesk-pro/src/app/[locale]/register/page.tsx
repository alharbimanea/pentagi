import Link from "next/link";
import { RegisterForm } from "@/components/auth/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveLocale, type LocaleParams } from "@/lib/page";

export default async function RegisterPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{dict.auth.registerTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RegisterForm locale={locale} dict={dict} />
          <p className="text-sm text-muted-foreground">
            {dict.auth.haveAccount}{" "}
            <Link href={`/${locale}/login`} className="text-accent underline">
              {dict.nav.login}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
