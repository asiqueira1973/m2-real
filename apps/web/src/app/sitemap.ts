/**
 * sitemap.xml (épico 8.11): as páginas públicas do site.
 * Recebe: nada. Devolve: as 4 URLs públicas (raiz, /conectar, /privacidade e /termos).
 */
import type { MetadataRoute } from "next";
import { siteOrigin } from "@/server/oauth/server";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/conectar", "/privacidade", "/termos"].map((p) => ({ url: `${siteOrigin()}${p}` }));
}
