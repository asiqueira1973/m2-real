/**
 * Rotina "vigia" (observabilidade O3; acréscimo pedido pelo usuário, plans/8.2-iptu.md e 8.8).
 * Roda todo dia no GitHub Actions: avalia a saúde das cargas (O2) e faz uma sonda sintética
 * (a busca de endereço da 11.5 precisa achar um prédio conhecido). Qualquer problema → código 1,
 * e o GitHub manda e-mail. Não grava em m2_execucoes_ingestao (não polui a métrica que avalia).
 */
import type { M2Client } from "@m2-real/db";
import { VIGIA_SONDA_ENDERECO } from "../config/regras.js";
import { loadHealth } from "./dados.js";

/**
 * Executa a vigia. Recebe: cliente service role e o instante. Devolve: o código de saída
 * (0 tudo certo, 1 problema) e as linhas do relatório (impressas no log do Actions).
 */
export async function runWatch(db: M2Client, agora: Date = new Date()): Promise<{ codigo: 0 | 1; linhas: string[] }> {
  const saude = await loadHealth(db, agora);
  const linhas = saude.rotinas.map((r) => `${r.estado === "ok" ? "ok " : "!! "} ${r.rotina}: ${r.estado}${r.motivo ? ` — ${r.motivo}` : ""}`);
  linhas.push(...saude.cobertura.map((c) => `!!  cobertura: ${c.motivo}`));

  const { data, error } = await db.rpc("m2_buscar_predio_por_endereco", { texto: VIGIA_SONDA_ENDERECO });
  const sondaOk = !error && (data?.length ?? 0) > 0;
  linhas.push(`${sondaOk ? "ok " : "!! "} sonda: busca "${VIGIA_SONDA_ENDERECO}" → ${error ? `erro: ${error.message}` : `${data?.length ?? 0} prédio(s)`}`);

  return { codigo: saude.ok && sondaOk ? 0 : 1, linhas };
}
