import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/en/portal", "/ar/portal", "/en/admin", "/ar/admin"] },
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
  };
}
