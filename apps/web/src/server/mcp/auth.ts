/**
 * Autenticação do MCP (seção 6.3): Authorization: Bearer <credencial>. Duas credenciais (8.10):
 *  - token OAuth `fpq_mcp_…` (m2_tokens_mcp), com o limite de chamadas da regra 11.22;
 *  - chave do painel (m2_chaves_api ativa), sem limite (é do admin).
 * Só o hash SHA-256 é guardado. O 401 aponta os metadados do recurso (RFC 9728), que é o que faz
 * o cliente MCP abrir o fluxo OAuth sozinho. SÓ SERVIDOR.
 */
import type { M2Client } from "@m2-real/db";
import { MCP_CHAMADAS_POR_DIA, MCP_CHAMADAS_POR_MINUTO } from "@m2-real/ingestao/regras";
import { hashKey } from "@/lib/chaves";
import { limiteAtingido } from "@/server/oauth/mensagens";
import { corsHeaders, MCP_TOKEN_PREFIX, resourceMetadataUrl } from "@/server/oauth/server";

/** Seção 15: mensagem para chave ausente, inválida ou revogada. */
export const MENSAGEM_CHAVE_INVALIDA = "Chave de API inválida ou revogada.";

/** Recebe: cabeçalho Authorization. Devolve: a chave, ou nulo se não for "Bearer <chave>". */
export function bearerFrom(cabecalho: string | null): string | null {
  const m = cabecalho?.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1]! : null;
}

/**
 * Confere a chave. Recebe: cliente service role e a chave. Devolve: o id da chave se ativa; senão nulo.
 */
export async function verifyKey(db: M2Client, chave: string): Promise<string | null> {
  const { data, error } = await db.from("m2_chaves_api").select("id, ativa").eq("hash_chave", hashKey(chave)).maybeSingle();
  if (error) throw new Error(`Falha ao conferir a chave: ${error.message}`);
  if (!data?.ativa) return null;
  return data.id;
}

/** Grava ultimo_uso_em da chave (tela Chaves de API). Recebe: cliente e id. Erro só vai para o log. */
export async function touchKey(db: M2Client, id: string): Promise<void> {
  const { error } = await db.from("m2_chaves_api").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", id);
  if (error) console.error(`Falha ao gravar ultimo_uso_em da chave ${id}: ${error.message}`);
}

/** Resultado da conferência: chave do painel, token OAuth (permitido ou no limite) ou nada. */
export type Credencial =
  | { tipo: "chave"; id: string }
  | { tipo: "token"; id: string; permitido: boolean; esperaS: number };

/**
 * Confere a credencial. Token OAuth: confere, aplica o limite (11.22), conta a chamada e grava
 * ultimo_uso_em numa ida ao banco (m2_usa_token_mcp). Chave: verifyKey.
 * Recebe: cliente service role e a credencial. Devolve: a credencial válida ou nulo.
 */
export async function verifyCredential(db: M2Client, valor: string): Promise<Credencial | null> {
  if (!valor.startsWith(MCP_TOKEN_PREFIX)) {
    const id = await verifyKey(db, valor);
    return id ? { tipo: "chave", id } : null;
  }
  const { data, error } = await db.rpc("m2_usa_token_mcp", { p_hash: hashKey(valor), p_por_minuto: MCP_CHAMADAS_POR_MINUTO, p_por_dia: MCP_CHAMADAS_POR_DIA });
  if (error) throw new Error(`Falha ao conferir o token: ${error.message}`);
  const linha = data?.[0];
  return linha ? { tipo: "token", id: linha.token_id, permitido: linha.permitido, esperaS: linha.espera_s } : null;
}

/** Resposta 401 da seção 6.3 / 15, com o resource_metadata (RFC 9728) para o cliente achar o OAuth. */
export function unauthorized(): Response {
  return Response.json({ erro: MENSAGEM_CHAVE_INVALIDA }, {
    status: 401,
    headers: { ...corsHeaders(), "WWW-Authenticate": `Bearer realm="fechouporquanto", resource_metadata="${resourceMetadataUrl()}"` },
  });
}

/** Regra 11.22: resposta 429 com Retry-After e a mensagem da seção 15. Recebe: segundos até liberar. */
export function tooManyRequests(esperaS: number): Response {
  return Response.json({ erro: limiteAtingido(esperaS) }, { status: 429, headers: { ...corsHeaders(), "Retry-After": String(esperaS) } });
}
