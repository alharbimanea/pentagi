import Link from "next/link";
import { requestDeletionAction } from "@/actions/profile";
import { unlinkChannelAction } from "@/actions/support";
import { ProfileForm, TelegramLink } from "@/components/orders/settings-forms";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { telegramConfigured } from "@/lib/integrations/telegram";
import { resolveLocale, type LocaleParams } from "@/lib/page";
import { serverClient } from "@/lib/supabase/server";

export default async function SettingsPage({ params }: { params: LocaleParams }) {
  const { locale, dict } = await resolveLocale(params);
  const viewer = await requireViewer(locale);
  const supabase = await serverClient();
  const [{ data: profile }, { data: identities }, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", viewer.user.id).single(),
    supabase.from("channel_identities").select("id, channel, display, verified_at").eq("user_id", viewer.user.id),
    supabase.auth.mfa.listFactors(),
  ]);
  const t = dict.settings;
  const hasMfa = Boolean(factors?.totp.some((f) => f.status === "verified"));
  const bot = serverEnv().TELEGRAM_BOT_USERNAME;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t.profile}</CardTitle>
          <p className="text-sm text-muted-foreground">{viewer.user.email}</p>
        </CardHeader>
        <CardContent>{profile ? <ProfileForm locale={locale} dict={dict} profile={profile} /> : null}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.security}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {hasMfa ? <Alert tone="success">{dict.auth.mfaEnabled}</Alert> : <p className="text-muted-foreground">{dict.auth.mfaIntro}</p>}
          <div className="flex flex-wrap gap-2">
            {!hasMfa ? (
              <Link href={`/${locale}/mfa`} className={buttonClass("outline", "sm")}>
                {dict.auth.mfaEnroll}
              </Link>
            ) : null}
            <Link href={`/${locale}/reset-password`} className={buttonClass("ghost", "sm")}>
              {dict.auth.resetTitle}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.channels}</CardTitle>
          <p className="text-sm text-muted-foreground">{t.channelsIntro}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="space-y-1">
            {identities?.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span>
                  {i.channel} · {i.display ?? "—"} {i.verified_at ? <span className="text-success">✓ {t.linked}</span> : null}
                </span>
                <form action={unlinkChannelAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    {t.unlink}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          {telegramConfigured() && bot ? <TelegramLink locale={locale} dict={dict} botUsername={bot} /> : <p className="text-muted-foreground">Telegram — {t.channelInactive}</p>}
          <p className="text-muted-foreground">WhatsApp — {t.channelInactive}</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t.privacy}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {profile?.deletion_requested_at ? (
            <Alert>
              {t.deletionRequested} ({formatDateTime(profile.deletion_requested_at, locale, profile.timezone)})
            </Alert>
          ) : (
            <form action={requestDeletionAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" size="sm" className="text-destructive">
                {t.requestDeletion}
              </Button>
            </form>
          )}
          <Link href={`/${locale}/legal/privacy`} className="text-accent underline">
            {dict.legal.pages.privacy}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
