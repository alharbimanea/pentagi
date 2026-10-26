import Link from "next/link";
import { googleSignInAction } from "@/actions/auth";
import { LoginForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publicEnv } from "@/lib/env";
import { one, resolveLocale, type LocaleParams, type SearchParams } from "@/lib/page";

export default async function LoginPage({ params, searchParams }: { params: LocaleParams; searchParams: SearchParams }) {
  const { locale, dict } = await resolveLocale(params);
  const sp = await searchParams;
  const next = one(sp.next);
  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{dict.auth.loginTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {one(sp.error) ? <Alert tone="error">{dict.errors.generic}</Alert> : null}
          <LoginForm locale={locale} dict={dict} next={next} />
          {publicEnv.googleAuthEnabled ? (
            <form action={googleSignInAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="next" value={next ?? ""} />
              <p className="mb-3 text-center text-xs text-muted-foreground">{dict.auth.or}</p>
              <button type="submit" className={buttonClass("outline", "md", "w-full")}>
                {dict.auth.google}
              </button>
            </form>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {dict.auth.noAccount}{" "}
            <Link href={`/${locale}/register`} className="text-accent underline">
              {dict.nav.register}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
