/**
 * robots.txt (épico 8.11): o site público é indexável; o painel, o OAuth e as APIs não.
 */
import type { MetadataRoute } from "next";
import { siteOrigin } from "@/server/oauth/server";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/login", "/oauth", "/api", "/auth"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
