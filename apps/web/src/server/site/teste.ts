/**
 * "Teste aqui" do site (épico 8.13; regra 11.23). SÓ SERVIDOR.
 * Recebe um endereço e o token do Turnstile, confere o robô, acha o prédio e, se este IP ainda não
 * buscou outro prédio na janela, devolve as 3 vendas mais recentes (data, valor e vagas). O IP nunca é
 * guardado: só o HMAC dele com SESSION_SECRET. Endereço não encontrado não gasta a busca.
 */
import { createHmac } from "node:crypto";
import type { M2Client } from "@m2-real/db";
import {
  MCP_ENDERECO_MAX, MCP_ENDERECO_MIN, SITE_TESTE_JANELA_DIAS, SITE_TESTE_MESES, SITE_TESTE_VENDAS, TURNSTILE_TIMEOUT_MS,
} from "@m2-real/ingestao/regras";
import { buildingSales, searchBuilding } from "@/server/mcp/dados";
import { MENSAGENS_MCP } from "@/server/mcp/ferramentas";

export const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Chaves de teste públicas da Cloudflare (sempre passam). Só fora de produção, enquanto as reais não existem.
const TURNSTILE_TESTE_SITE = "1x00000000000000000000AA";
const TURNSTILE_TESTE_SEGREDO = "1x0000000000000000000000000000000AA";
const dev = () => process.env.NODE_ENV !== "production";

/** Chave pública do Turnstile para a página (vazia em produção sem chave: a seção não aparece). */
export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (dev() ? TURNSTILE_TESTE_SITE : "");
}

export type VendaAmostra = { data: string; valor_total: number; valor_vagas: number };
export type ResultadoTeste =
  | { tipo: "erro"; mensagem: string }
  | { tipo: "fora"; mensagem: string }
  | { tipo: "limite" }
  | { tipo: "ok"; predio: { endereco: string; bairro: string | null; ano_construcao: number | null }; vendas: VendaAmostra[] };

/** IP de quem chamou (a Vercel preenche x-forwarded-for; o primeiro é o cliente). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "desconhecido";
}

/** Regra 11.23: HMAC do IP (irreversível sem o segredo). Recebe: IP e segredo. Devolve: hex. */
export function ipHash(ip: string, segredo = process.env.SESSION_SECRET ?? ""): string {
  return createHmac("sha256", segredo).update(`teste-site:${ip}`).digest("hex");
}

/** Confere o token do Turnstile na Cloudflare. Recebe: token e IP. Devolve: se passou. */
export async function verifyTurnstile(token: string, ip: string, f: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY || (dev() ? TURNSTILE_TESTE_SEGREDO : "");
  if (!secret || !token) return false;
  try {
    const r = await f(TURNSTILE_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    return r.ok && ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export const MENSAGENS_TESTE = {
  endereco: `Digite o endereço do prédio, com rua e número (${MCP_ENDERECO_MIN} a ${MCP_ENDERECO_MAX} caracteres).`,
  robo: "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.",
} as const;

/**
 * Faz o teste (regra 11.23). Recebe: cliente service role, endereço, token, IP e o verificador do
 * Turnstile (injetável nos testes). Devolve: o resultado para a tela e o hash do IP (para o evento).
 */
export async function runSiteTest(
  db: M2Client, endereco: string, token: string, ip: string, turnstile: (t: string, ip: string) => Promise<boolean> = verifyTurnstile,
): Promise<{ resultado: ResultadoTeste; hash: string }> {
  const hash = ipHash(ip);
  const e = endereco.trim();
  if (e.length < MCP_ENDERECO_MIN || e.length > MCP_ENDERECO_MAX) return { resultado: { tipo: "erro", mensagem: MENSAGENS_TESTE.endereco }, hash };
  if (!(await turnstile(token, ip))) return { resultado: { tipo: "erro", mensagem: MENSAGENS_TESTE.robo }, hash };
  const [predio] = await searchBuilding(db, e);
  // Não encontrado não gasta a busca (regra 11.23): quem errou a digitação tenta de novo.
  if (!predio) return { resultado: { tipo: "fora", mensagem: MENSAGENS_MCP.foraDaCobertura }, hash };
  const { data: permitido, error } = await db.rpc("m2_registra_teste_site", { p_ip_hash: hash, p_predio_id: predio.predio_id, p_janela_dias: SITE_TESTE_JANELA_DIAS });
  if (error) throw new Error(`Falha ao registrar o teste: ${error.message}`);
  if (!permitido) return { resultado: { tipo: "limite" }, hash };
  const vendas = (await buildingSales(db, predio.predio_id, SITE_TESTE_MESES))
    .slice(0, SITE_TESTE_VENDAS)
    .map((v) => ({ data: v.data, valor_total: v.valor_total, valor_vagas: v.valor_vagas }));
  return { resultado: { tipo: "ok", predio: { endereco: predio.endereco, bairro: predio.bairro, ano_construcao: predio.ano_construcao }, vendas }, hash };
}
