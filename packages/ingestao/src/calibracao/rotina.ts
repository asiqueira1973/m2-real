/**
 * Rotina calibracao (seção 4.4: "ao fim de cada rotina acima"). Recalcula, nesta ordem:
 *  1. ligação tardia das guias às unidades do IPTU (seção 9.2; m2_ligar_transacoes_unidades);
 *  2. recasamento dos anúncios com os fatores da execução anterior (11.8; épico 8.6);
 *  3. área, fator e selo das plantas, fator_predio, fatores de referência e revisões
 *     (11.9, 11.10, 11.11, 11.12; épico 8.6);
 *  4. vendas consolidadas, já com as áreas novas (épico 8.4; regras 11.14, 11.15, 11.16, 11.11);
 *  5. cobertura por bairro (D12; épico 8.6).
 * Execução registrada com fonte "calibracao" (decisão do usuário, plans/8.4-consolidacao.md).
 */
import type { M2Client } from "@m2-real/db/server";
import { runRoutine, supabaseExecutionStore } from "../shared/execucao.js";
import { withRetry } from "../shared/retry.js";
import { computeCoverage } from "./cobertura.js";
import { consolidarVendas, marcarForaDaCurva } from "./consolidar.js";
import { loadManualOutliers, loadPurchaseSlips } from "./dados.js";
import { writeSales } from "./gravacao.js";
import {
  loadMatchedAds, loadMatchedEditais, loadPlantsAndBuildings, loadReferenceFactors, rematchAds, writeCalibration, writeCoverage,
} from "./plantas.js";
import { adEvidence, calibrate } from "./selos.js";

/**
 * Executa a calibração.
 * Recebe: cliente service role. Devolve: id da execução e contagens.
 * Erro → execução "falhou" e exit ≠ 0 (observabilidade O1).
 */
export async function runCalibration(db: M2Client, agora: () => Date = () => new Date()) {
  return runRoutine(supabaseExecutionStore(db), "calibracao", "calibracao", null, async () => {
    const ligadas = await withRetry(() => db.rpc("m2_ligar_transacoes_unidades"), "Falha ao ligar guias às unidades (9.2)");

    // 8.6: recasamento, selos e fatores.
    const { plantas, predios } = await loadPlantsAndBuildings(db);
    const recasados = await rematchAds(db, plantas, predios, await loadReferenceFactors(db));
    const plantasDe = new Map<string, typeof plantas>();
    for (const p of plantas) plantasDe.set(p.predioId, [...(plantasDe.get(p.predioId) ?? []), p]);
    const evidencias = (await loadMatchedAds(db)).flatMap((a) => adEvidence(a, plantasDe.get(a.predioId) ?? []));
    const resultado = calibrate(plantas, predios, evidencias, await loadMatchedEditais(db));
    const gravado = await writeCalibration(db, resultado, predios);

    const guias = await loadPurchaseSlips(db);
    const manuais = await loadManualOutliers(db);
    const vendas = marcarForaDaCurva(consolidarVendas(guias), manuais);
    const { gravadas, apagadas } = await writeSales(db, vendas);

    const { data: bairros, error: erroBairros } = await db.from("m2_bairros").select("id");
    if (erroBairros) throw new Error(`Falha ao ler bairros: ${erroBairros.message}`);
    const cobertura = computeCoverage(bairros.map((b) => b.id), vendas, agora());
    await writeCoverage(db, cobertura);

    const novoSelo = new Map(resultado.alteradas.map((x) => [x.id, x.selo]));
    const selos = new Map<string, number>();
    for (const p of plantas) {
      const s = novoSelo.get(p.id) ?? p.selo;
      selos.set(s, (selos.get(s) ?? 0) + 1);
    }
    console.log(
      `Calibração 8.6: ${recasados} anúncios recasados; ${evidencias.length} evidências de anúncios; ${gravado.plantas} plantas alteradas, ` +
        `${gravado.historico} linhas de histórico, ${gravado.predios} fatores de prédio, ${gravado.grupos} grupos de fator de referência; ` +
        `selos: ${[...selos].map(([s, n]) => `${s} ${n}`).join(", ")}; cobertura: ` +
        cobertura.map((c) => `${c.bairroId}=${c.pctCobertura}%`).join(" "),
    );

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
