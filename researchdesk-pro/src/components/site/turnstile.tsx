"use client";

import Script from "next/script";
import { publicEnv } from "@/lib/env";

// Renders nothing without a site key; the server then decides whether a
// missing token is acceptable (development) or not (production).
export function Turnstile({ locale }: { locale: string }) {
  if (!publicEnv.turnstileSiteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={publicEnv.turnstileSiteKey} data-language={locale} data-theme="auto" />
    </>
  );
}
