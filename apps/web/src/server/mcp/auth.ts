/**
 * Autenticação do MCP (seção 6.3): Authorization: Bearer <chave>, conferida pelo hash SHA-256 contra
 * m2_chaves_api ativa. A chave nunca é guardada; só o hash. SÓ SERVIDOR.
 */
import type { M2Client } from "@m2-real/db";
import { hashKey } from "@/lib/chaves";

/** Seção 15: mensagem para chave ausente, inválida ou revogada. */
export const MENSAGEM_CHAVE_INVALIDA = "Chave de API inválida ou revogada.";

/** Recebe: cabeçalho Authorization. Devolve: a chave, ou nulo se não for "Bearer <chave>". */
export function bearerFrom(cabecalho: string | null): string | null {
  const m = cabecalho?.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1]! : null;
}

/**
 * Confere a chave. Recebe: cliente service role e a chave. Devolve: o id da chave se ativa; senão nulo.
 * Grava ultimo_uso_em sem esperar (a resposta não depende disso).
 */
export async function verifyKey(db: M2Client, chave: string): Promise<string | null> {
  const { data, error } = await db.from("m2_chaves_api").select("id, ativa").eq("hash_chave", hashKey(chave)).maybeSingle();
  if (error) throw new Error(`Falha ao conferir a chave: ${error.message}`);
  if (!data?.ativa) return null;
  void db.from("m2_chaves_api").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", data.id).then(() => undefined);
  return data.id;
}

/** Resposta 401 da seção 6.3 / 15. */
export function unauthorized(): Response {
  return Response.json({ erro: MENSAGEM_CHAVE_INVALIDA }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="fechouporquanto"' } });
}
