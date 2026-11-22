/**
 * Allowlist de domínios da coleta de anúncios (épico 8.5; assunção A4; seção 20).
 * Só páginas destes domínios (ou subdomínios deles) são raspadas.
 */
import { ANUNCIO_DOMINIOS } from "../config/regras.js";

/**
 * Domínio da allowlist a que a URL pertence.
 * Recebe: URL e a allowlist (padrão: ANUNCIO_DOMINIOS). Devolve: o domínio ("lopes.com.br")
 * ou nulo se a URL for de fora (inclusive "lopes.com.br.outro.com" e protocolos que não são http/https).
 */
export function allowedDomain(url: string, dominios: readonly string[] = ANUNCIO_DOMINIOS): string | null {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  return dominios.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

/**
 * Trecho da busca que restringe aos domínios da allowlist (seção 8.5: "restrito aos domínios").
 * Recebe: a allowlist. Devolve: "(site:a OR site:b …)".
 */
export function siteFilter(dominios: readonly string[] = ANUNCIO_DOMINIOS): string {
  return `(${dominios.map((d) => `site:${d}`).join(" OR ")})`;
}
