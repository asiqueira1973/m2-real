/**
 * sitemap.xml (épico 8.11): as páginas públicas do site.
 */
import type { MetadataRoute } from "next";
import { siteOrigin } from "@/server/oauth/server";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/conectar", "/privacidade", "/termos"].map((p) => ({ url: `${siteOrigin()}${p}` }));
}
