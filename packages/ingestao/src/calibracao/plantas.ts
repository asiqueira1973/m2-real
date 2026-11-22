/**
 * Banco da calibração das plantas (épico 8.6): leitura paginada (max_rows; pegadinha do CLAUDE.md),
 * recasamento dos anúncios (11.8) e gravação em lote pelas funções de
 * 20261122160000_m2_calibracao_plantas.sql. O cálculo fica em selos.ts, fatores.ts e cobertura.ts.
 */
import type { M2Client } from "@m2-real/db/server";
import { casarAnuncio, type StatusCasamento } from "../anuncios/casamento.js";
import { withRetry, type RetryOptions } from "../shared/retry.js";
import type { Selo } from "./consolidar.js";
import type { LinhaCobertura } from "./cobertura.js";
import { fetchAllPages } from "./dados.js";
import { decadeOf, groupFor, type FatorReferencia } from "./fatores.js";
import type { AnuncioCasado, Calibracao, EvidenciaEdital, FonteArea, MotivoRevisao, PlantaEstado, PredioInfo } from "./selos.js";

const LOTE_PLANTAS = 500;
const LOTE_PREDIOS = 1000;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Prédio com o fator gravado (para o recasamento). */
export interface PredioComFator extends PredioInfo {
  fatorPredio: number | null;
}

/**
 * Lê plantas e prédios. Recebe: cliente. Devolve: estado das plantas e prédios (com fator_predio).
 */
export async function loadPlantsAndBuildings(db: M2Client, retry: RetryOptions = {}): Promise<{ plantas: PlantaEstado[]; predios: PredioComFator[] }> {
  const plantas = await fetchAllPages<Record<string, unknown>>(
    (de, ate) => db.from("m2_plantas")
      .select("id, predio_id, area_iptu_referencia, qtd_unidades, area_privativa, vagas_inclusas, quartos, fator, selo, fonte_area, faixa_erro_pct, especial, revisao_pendente, motivo_revisao")
      .order("id").range(de, ate) as never,
    "Falha ao ler plantas (8.6)", retry,
  );
  const predios = await fetchAllPages<{ id: string; bairro_id: number; ano_construcao: number | null; vagas_cadastro_proprio: boolean; fator_predio: number | null }>(
    (de, ate) => db.from("m2_predios").select("id, bairro_id, ano_construcao, vagas_cadastro_proprio, fator_predio").order("id").range(de, ate),
    "Falha ao ler prédios (8.6)", retry,
  );
  return {
    plantas: plantas.map((p) => ({
      id: p.id as string, predioId: p.predio_id as string, areaIptu: Number(p.area_iptu_referencia), qtdUnidades: Number(p.qtd_unidades),
      areaPrivativa: num(p.area_privativa), vagasInclusas: num(p.vagas_inclusas), quartos: num(p.quartos), fator: num(p.fator),
      selo: p.selo as Selo, fonteArea: p.fonte_area as FonteArea | null, faixaErroPct: num(p.faixa_erro_pct), especial: p.especial as boolean,
      revisaoPendente: p.revisao_pendente as boolean, motivoRevisao: p.motivo_revisao as MotivoRevisao | null,
    })),
    predios: predios.map((p) => ({
      id: p.id, bairroId: p.bairro_id, decada: decadeOf(p.ano_construcao), vagasCadastroProprio: p.vagas_cadastro_proprio, fatorPredio: num(p.fator_predio),
    })),
  };
}

/** Fatores de referência gravados pela execução anterior (para o recasamento). */
export async function loadReferenceFactors(db: M2Client, retry: RetryOptions = {}): Promise<FatorReferencia[]> {
  const linhas = await fetchAllPages<{ id: string; bairro_id: number | null; decada_construcao: number | null; vagas_cadastro_proprio: boolean; fator_mediano: number; fator_p25: number; fator_p75: number; qtd_plantas: number }>(
    (de, ate) => db.from("m2_fatores_referencia").select("id, bairro_id, decada_construcao, vagas_cadastro_proprio, fator_mediano, fator_p25, fator_p75, qtd_plantas").order("id").range(de, ate),
    "Falha ao ler fatores de referência", retry,
  );
  return linhas.map((f) => ({
    bairroId: f.bairro_id, decada: f.decada_construcao, vagasCadastroProprio: f.vagas_cadastro_proprio,
    fatorMediano: Number(f.fator_mediano), fatorP25: Number(f.fator_p25), fatorP75: Number(f.fator_p75), qtdPlantas: f.qtd_plantas,
  }));
}

/**
 * Regra 11.8 (recasamento): anúncios casado_predio ou ambiguo, não casados à mão (11.11), passam de
 * novo pelo casamento com o fator do prédio ou, sem ele, o fator de referência do grupo — os dois da
 * execução anterior (interpretação, plans/8.6-calibracao.md). Grava só o que mudou.
 * Recebe: cliente, plantas, prédios e fatores. Devolve: quantos anúncios mudaram.
 */
export async function rematchAds(
  db: M2Client,
  plantas: readonly PlantaEstado[],
  predios: readonly PredioComFator[],
  fatores: readonly FatorReferencia[],
  retry: RetryOptions = {},
): Promise<number> {
  const anuncios = await fetchAllPages<{ id: string; predio_id: string; fonte: "anuncio" | "pagina_condominio"; area_privativa: number | null; area_privativa_min: number | null; area_privativa_max: number | null; confianca_casamento: number | null; status_casamento: StatusCasamento; planta_id: string | null }>(
    (de, ate) => db.from("m2_anuncios")
      .select("id, predio_id, fonte, area_privativa, area_privativa_min, area_privativa_max, confianca_casamento, status_casamento, planta_id")
      .in("status_casamento", ["casado_predio", "ambiguo"]).eq("casado_manual", false).not("predio_id", "is", null)
      .order("id").range(de, ate) as never,
    "Falha ao ler anúncios para o recasamento", retry,
  );
  const predioPorId = new Map(predios.map((p) => [p.id, p]));
  const plantasDe = new Map<string, { id: string; areaIptuReferencia: number }[]>();
  for (const p of plantas) plantasDe.set(p.predioId, [...(plantasDe.get(p.predioId) ?? []), { id: p.id, areaIptuReferencia: p.areaIptu }]);

  let mudaram = 0;
  for (const a of anuncios) {
    const pr = predioPorId.get(a.predio_id);
    if (!pr) continue;
    const fator = pr.fatorPredio ?? groupFor(fatores, pr.bairroId, pr.decada, pr.vagasCadastroProprio)?.fatorMediano ?? null;
    const c = casarAnuncio(
      { fonte: a.fonte, area_privativa: num(a.area_privativa), area_privativa_min: num(a.area_privativa_min), area_privativa_max: num(a.area_privativa_max) },
      { id: a.predio_id, similaridade: num(a.confianca_casamento) ?? 1 },
      plantasDe.get(a.predio_id) ?? [], fator,
    );
    if (c.status === a.status_casamento && c.plantaId === a.planta_id) continue;
    await withRetry(
      () => db.from("m2_anuncios").update({ status_casamento: c.status, planta_id: c.plantaId }).eq("id", a.id).eq("casado_manual", false),
      "Falha ao gravar o recasamento do anúncio", retry,
    );
    mudaram++;
  }
  return mudaram;
}

/** Anúncios casados com planta (evidências da 11.9). */
export async function loadMatchedAds(db: M2Client, retry: RetryOptions = {}): Promise<(AnuncioCasado & { predioId: string })[]> {
  const linhas = await fetchAllPages<{ id: string; planta_id: string; predio_id: string; fonte: "anuncio" | "pagina_condominio"; area_privativa: number | null; area_privativa_min: number | null; area_privativa_max: number | null; vagas: number | null; quartos: number | null }>(
    (de, ate) => db.from("m2_anuncios")
      .select("id, planta_id, predio_id, fonte, area_privativa, area_privativa_min, area_privativa_max, vagas, quartos")
      .eq("status_casamento", "casado_planta").not("planta_id", "is", null).order("id").range(de, ate) as never,
    "Falha ao ler anúncios casados", retry,
  );
  return linhas.map((a) => ({
    id: a.id, plantaId: a.planta_id, predioId: a.predio_id, fonte: a.fonte, areaPrivativa: num(a.area_privativa),
    areaMin: num(a.area_privativa_min), areaMax: num(a.area_privativa_max), vagas: num(a.vagas), quartos: num(a.quartos),
  }));
}

/** Editais casados à unidade com área privativa, já com a planta da unidade (11.9, 11.20). */
export async function loadMatchedEditais(db: M2Client, retry: RetryOptions = {}): Promise<EvidenciaEdital[]> {
  const linhas = await fetchAllPages<{ id: string; area_privativa: number; vagas: number | null; vagas_vinculadas_area: boolean | null; unidade: { planta_id: string | null } | null }>(
    (de, ate) => db.from("m2_editais_leilao")
      .select("id, area_privativa, vagas, vagas_vinculadas_area, unidade:m2_unidades(planta_id)")
      .eq("status_casamento", "casado_unidade").not("area_privativa", "is", null).order("id").range(de, ate) as never,
    "Falha ao ler editais casados", retry,
  );
  return linhas
    .filter((e) => e.unidade?.planta_id)
    .map((e) => ({ id: e.id, plantaId: e.unidade!.planta_id!, area: Number(e.area_privativa), vagas: num(e.vagas), vagasVinculadas: e.vagas_vinculadas_area }));
}

/**
 * Grava o resultado de calibrate: plantas alteradas com o histórico (em lotes, por
 * m2_aplicar_calibracao_plantas, que também barra a 11.11), fator_predio dos prédios que mudaram e
 * os fatores de referência. Recebe: cliente, resultado e prédios lidos. Devolve: contagens.
 */
export async function writeCalibration(
  db: M2Client,
  r: Calibracao,
  predios: readonly PredioComFator[],
  retry: RetryOptions = {},
): Promise<{ plantas: number; historico: number; predios: number; grupos: number }> {
  const histPorPlanta = new Map(r.historico.map((h) => [h.plantaId, h]));
  let plantas = 0;
  for (let i = 0; i < r.alteradas.length; i += LOTE_PLANTAS) {
    const lote = r.alteradas.slice(i, i + LOTE_PLANTAS);
    const linhas = lote.map((p) => ({
      id: p.id, area_privativa: p.areaPrivativa, vagas_inclusas: p.vagasInclusas, quartos: p.quartos, fator: p.fator, selo: p.selo,
      fonte_area: p.fonteArea, faixa_erro_pct: p.faixaErroPct, especial: p.especial, revisao_pendente: p.revisaoPendente, motivo_revisao: p.motivoRevisao,
    }));
    const hist = lote.map((p) => histPorPlanta.get(p.id)).filter((h) => h !== undefined).map((h) => ({
      planta_id: h.plantaId, area_privativa: h.areaPrivativa, vagas_inclusas: h.vagasInclusas, fator: h.fator, selo: h.selo, fonte: h.fonte,
      anuncios_ids: h.anunciosIds, editais_ids: h.editaisIds,
    }));
    plantas += await withRetry(
      () => db.rpc("m2_aplicar_calibracao_plantas", { plantas: linhas as never, historico: hist as never }),
      "Falha ao gravar a calibração das plantas", retry,
    );
  }

  const mudaram = predios.filter((p) => (r.fatorPredio.get(p.id) ?? null) !== p.fatorPredio);
  let nPredios = 0;
  for (let i = 0; i < mudaram.length; i += LOTE_PREDIOS) {
    const lote = mudaram.slice(i, i + LOTE_PREDIOS);
    nPredios += await withRetry(
      () => db.rpc("m2_atualizar_fator_predio", { ids: lote.map((p) => p.id), fatores: lote.map((p) => r.fatorPredio.get(p.id) ?? null) as number[] }),
      "Falha ao gravar fator_predio", retry,
    );
  }

  const grupos = await withRetry(
    () => db.rpc("m2_substituir_fatores_referencia", {
      linhas: r.fatoresReferencia.map((f) => ({
        bairro_id: f.bairroId, decada_construcao: f.decada, vagas_cadastro_proprio: f.vagasCadastroProprio,
        fator_mediano: f.fatorMediano, fator_p25: f.fatorP25, fator_p75: f.fatorP75, qtd_plantas: f.qtdPlantas,
      })) as never,
    }),
    "Falha ao gravar fatores de referência", retry,
  );
  return { plantas, historico: r.historico.length, predios: nPredios, grupos };
}

/**
 * Grava a foto da cobertura (uma linha por bairro; m2_cobertura_bairros é só inserção).
 * Sem withRetry: inserção não é idempotente (repetir depois de uma resposta perdida duplicaria a
 * foto). Em erro, lança e a execução falha (O1).
 * Recebe: cliente e as linhas de computeCoverage. Devolve: nada.
 */
export async function writeCoverage(db: M2Client, linhas: readonly LinhaCobertura[]): Promise<void> {
  const { error } = await db.from("m2_cobertura_bairros").insert(linhas.map((l) => ({
    bairro_id: l.bairroId, vendas_24m: l.vendas24m, vendas_confirmada: l.vendasConfirmada, vendas_calibrada: l.vendasCalibrada,
    vendas_indicativa: l.vendasIndicativa, vendas_estimada: l.vendasEstimada, vendas_sem_dado: l.vendasSemDado, pct_cobertura: l.pctCobertura,
  })));
  if (error) throw new Error(`Falha ao gravar a cobertura: ${error.message}`);
}
