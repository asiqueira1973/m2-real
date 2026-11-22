/**
 * Gravação das vendas consolidadas (épico 8.4; seção 7.2: tabela recalculada inteira a cada
 * calibração; 7.5 e 11.11: linhas marcadas pelo admin são preservadas).
 */
import type { M2Client } from "@m2-real/db/server";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import type { VendaConsolidada } from "./consolidar.js";

const LOTE = 1000;

/**
 * Grava as vendas (upsert por transacao_apartamento_id) e apaga as que deixaram de existir,
 * exceto as marcadas pelo admin. marcado_manual não é enviado no upsert, então o valor do
 * admin continua como está.
 * Recebe: cliente e vendas (com foraDaCurva já decidido). Devolve: gravadas e apagadas.
 */
export async function writeSales(
  db: M2Client,
  vendas: readonly VendaConsolidada[],
  retry: RetryOptions = {},
): Promise<{ gravadas: number; apagadas: number }> {
  for (let i = 0; i < vendas.length; i += LOTE) {
    const linhas = vendas.slice(i, i + LOTE).map((v) => ({
      transacao_apartamento_id: v.transacaoApartamentoId,
      transacoes_vagas_ids: v.transacoesVagasIds,
      predio_id: v.predioId,
      unidade_id: v.unidadeId,
      planta_id: v.plantaId,
      data_transacao: v.dataTransacao,
      valor_apartamento: v.valorApartamento,
      valor_vagas: v.valorVagas,
      valor_total: v.valorTotal,
      qtd_vagas_separadas: v.qtdVagasSeparadas,
      vagas_inclusas_area: v.vagasInclusasArea,
      area_privativa: v.areaPrivativa,
      selo_area: v.seloArea,
      m2_privativo: v.m2Privativo,
      m2_iptu: v.m2Iptu,
      fora_da_curva: v.foraDaCurva,
    }));
    await withRetry(
      () => db.from("m2_vendas_consolidadas").upsert(linhas, { onConflict: "transacao_apartamento_id" }),
      "Falha ao gravar m2_vendas_consolidadas",
      retry,
    );
  }
  const manter = vendas.map((v) => v.transacaoApartamentoId);
  const apagadas = await withRetry(
    () => db.rpc("m2_vendas_remover_obsoletas", { manter }),
    "Falha ao remover vendas obsoletas",
    retry,
  );
  return { gravadas: vendas.length, apagadas };
}
