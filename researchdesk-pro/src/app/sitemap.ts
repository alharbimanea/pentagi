import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { POLICY_SLUGS } from "@/lib/i18n/legal";

const PAGES = ["", "/services", "/pricing", "/faq", "/about", "/contact", "/blog", ...POLICY_SLUGS.map((s) => `/legal/${s}`)];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${publicEnv.siteUrl}/en${path}`,
    alternates: { languages: { en: `${publicEnv.siteUrl}/en${path}`, ar: `${publicEnv.siteUrl}/ar${path}` } },
  }));
}
