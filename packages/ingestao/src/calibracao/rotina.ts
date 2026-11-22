/**
 * Rotina calibracao (seção 4.4: "ao fim de cada rotina acima"). Recalcula, nesta ordem:
 *  1. ligação tardia das guias às unidades do IPTU (seção 9.2; m2_ligar_transacoes_unidades);
 *  2. vendas consolidadas (épico 8.4; regras 11.14, 11.15, 11.16, 11.11).
 * Selos, fatores de referência e cobertura entram no épico 8.6.
 * Execução registrada com fonte "calibracao" (decisão do usuário, plans/8.4-consolidacao.md).
 */
import type { M2Client } from "@m2-real/db/server";
import { runRoutine, supabaseExecutionStore } from "../shared/execucao.js";
import { withRetry } from "../shared/retry.js";
import { consolidarVendas, marcarForaDaCurva } from "./consolidar.js";
import { loadManualOutliers, loadPurchaseSlips } from "./dados.js";
import { writeSales } from "./gravacao.js";

/**
 * Executa a calibração.
 * Recebe: cliente service role. Devolve: id da execução e contagens.
 * Erro → execução "falhou" e exit ≠ 0 (observabilidade O1).
 */
export async function runCalibration(db: M2Client) {
  return runRoutine(supabaseExecutionStore(db), "calibracao", "calibracao", null, async () => {
    const ligadas = await withRetry(() => db.rpc("m2_ligar_transacoes_unidades"), "Falha ao ligar guias às unidades (9.2)");

    const guias = await loadPurchaseSlips(db);
    const manuais = await loadManualOutliers(db);
    const vendas = marcarForaDaCurva(consolidarVendas(guias), manuais);
    const { gravadas, apagadas } = await writeSales(db, vendas);

    const comVagas = vendas.filter((v) => v.qtdVagasSeparadas > 0).length;
    const fora = vendas.filter((v) => v.foraDaCurva).length;
    console.log(
      `Calibração: ${ligadas} guias ligadas a unidades (9.2); ${guias.length} guias de compra e venda lidas; ` +
        `${gravadas} vendas consolidadas (${comVagas} com vagas separadas, ${fora} fora da curva); ${apagadas} vendas obsoletas apagadas.`,
    );
    // Descartadas = guias que não viraram venda nem foram agregadas como vaga (11.14, vaga sem
    // apartamento, unidade "outro"); as vagas agregadas não são descarte.
    const vagasAgregadas = vendas.reduce((s, v) => s + v.qtdVagasSeparadas, 0);
    return { linhasLidas: guias.length, linhasGravadas: gravadas, linhasDescartadas: guias.length - gravadas - vagasAgregadas };
  });
}
