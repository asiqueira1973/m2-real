/**
 * robots.txt (épico 8.11): o site público é indexável; o painel, o login, o OAuth e as APIs não.
 * Recebe: nada. Devolve: as regras e o endereço do sitemap (de NEXT_PUBLIC_SITE_URL).
 */
import type { MetadataRoute } from "next";
import { siteOrigin } from "@/server/oauth/server";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/login", "/oauth", "/api", "/auth"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
