/**
 * Calibração das plantas (épico 8.6; regras 11.9, 11.10, 11.11 e 11.12). Funções puras, sem banco.
 * A rotina (calibracao/plantas.ts) lê as plantas, os prédios e as evidências, chama calibrate e grava
 * só o que mudou.
 */
import {
  CALIBRADA_CONCORDANCIA, CALIBRADA_MIN_EVIDENCIAS, COERENCIA_FATOR_PREDIO, COERENCIA_MIN_PLANTAS, EDITAIS_CONCORDANCIA,
  EDITAL_DIVERGENCIA_ANUNCIOS, ESPECIAL_MAX_UNIDADES, ESPECIAL_RAZAO_AREA, INDICATIVA_CONCORDANCIA,
} from "../config/regras.js";
import type { Selo } from "./consolidar.js";
import { computeReferenceFactors, errorRangePct, groupFor, type FatorReferencia } from "./fatores.js";

export type FonteArea = "anuncio" | "pagina_condominio" | "edital_leilao" | "revisao_manual" | "fator_referencia";
export type MotivoRevisao = "fator_incoerente" | "anuncios_divergentes" | "anuncio_ambiguo" | "planta_especial" | "venda_fora_da_curva" | "edital_divergente";

/** Estado de uma planta (colunas de m2_plantas que a calibração lê ou grava). */
export interface PlantaEstado {
  id: string;
  predioId: string;
  areaIptu: number;
  qtdUnidades: number;
  areaPrivativa: number | null;
  vagasInclusas: number | null;
  quartos: number | null;
  fator: number | null;
  selo: Selo;
  fonteArea: FonteArea | null;
  faixaErroPct: number | null;
  especial: boolean;
  revisaoPendente: boolean;
  motivoRevisao: MotivoRevisao | null;
}

export interface PredioInfo {
  id: string;
  bairroId: number;
  decada: number | null;
  vagasCadastroProprio: boolean;
}

/** Evidência de anúncio ou página de condomínio já atribuída a uma planta (11.8). */
export interface EvidenciaAnuncio {
  id: string;
  plantaId: string;
  fonte: "anuncio" | "pagina_condominio";
  area: number;
  vagas: number | null;
  quartos: number | null;
}

/** Edital casado à unidade (11.20) com área privativa, já atribuído à planta da unidade. */
export interface EvidenciaEdital {
  id: string;
  plantaId: string;
  area: number;
  vagas: number | null;
  vagasVinculadas: boolean | null;
}

/** Anúncio casado com a planta, como vem do banco (para adEvidence). */
export interface AnuncioCasado {
  id: string;
  plantaId: string;
  fonte: "anuncio" | "pagina_condominio";
  areaPrivativa: number | null;
  areaMin: number | null;
  areaMax: number | null;
  vagas: number | null;
  quartos: number | null;
}

/** Resultado da calibração de uma execução. */
export interface Calibracao {
  /** Plantas cujo estado mudou (as bloqueadas pela 11.11 nunca aparecem). */
  alteradas: PlantaEstado[];
  /** Linhas de m2_calibracoes: uma por planta cuja área, fator, selo ou fonte mudou. */
  historico: { plantaId: string; areaPrivativa: number | null; vagasInclusas: number | null; fator: number | null; selo: Selo; fonte: FonteArea; anunciosIds: string[]; editaisIds: string[] }[];
  /** fator_predio de cada prédio (nulo sem planta ≥ indicativa). */
  fatorPredio: Map<string, number | null>;
  /** Grupos da regra 11.10 com ≥ 8 plantas. */
  fatoresReferencia: FatorReferencia[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Mediana de uma lista não vazia. */
export function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

/** Regra 11.11: planta confirmada em revisão manual — o pipeline nunca altera. */
export function isLocked(p: Pick<PlantaEstado, "selo" | "fonteArea">): boolean {
  return p.selo === "confirmada" && p.fonteArea === "revisao_manual";
}

/**
 * Evidências de um anúncio casado com planta (11.8 / 11.9).
 * Página de condomínio com faixa (min < max) num prédio de exatamente 2 plantas: o mínimo vai para a
 * planta menor e o máximo para a maior (combinado no 8.5, anuncios/casamento.ts). Nos outros casos, a
 * área única do anúncio (ou a faixa degenerada min = max) vai para a planta casada.
 * Recebe: o anúncio e as plantas do prédio. Devolve: as evidências (pode ser vazio).
 */
export function adEvidence(a: AnuncioCasado, plantasDoPredio: readonly Pick<PlantaEstado, "id" | "areaIptu">[]): EvidenciaAnuncio[] {
  const base = { id: a.id, fonte: a.fonte, vagas: a.vagas, quartos: a.quartos };
  if (a.fonte === "pagina_condominio" && a.areaMin !== null && a.areaMax !== null && a.areaMin < a.areaMax && plantasDoPredio.length === 2) {
    const [menor, maior] = [...plantasDoPredio].sort((x, y) => x.areaIptu - y.areaIptu) as [typeof plantasDoPredio[0], typeof plantasDoPredio[0]];
    return [{ ...base, plantaId: menor.id, area: a.areaMin }, { ...base, plantaId: maior.id, area: a.areaMax }];
  }
  const area = a.areaPrivativa ?? (a.areaMin !== null && a.areaMin === a.areaMax ? a.areaMin : null);
  return area === null ? [] : [{ ...base, plantaId: a.plantaId, area }];
}

/** Valores a até `tol` da mediana de todos (com seus índices). */
function concordantes(valores: readonly number[], tol: number): number[] {
  const med = median(valores);
  return valores.map((v, i) => (Math.abs(v - med) / med <= tol ? i : -1)).filter((i) => i >= 0);
}

/**
 * Regra 11.9 para os anúncios de uma planta.
 * - 1 evidência → indicativa;
 * - ≥ 2 a até 3% da mediana de todas → calibrada, área = mediana das que concordam (T2);
 * - senão, ≥ 2 a até 8% → indicativa, área = mediana delas;
 * - senão → divergentes (sem área; vai para a revisão com anuncios_divergentes).
 * Recebe: evidências da planta. Devolve: selo, área e as evidências usadas — ou nulo sem evidência.
 */
export function adSeal(ev: readonly EvidenciaAnuncio[]):
  | { selo: "calibrada" | "indicativa"; area: number; usadas: EvidenciaAnuncio[] }
  | { selo: "divergente"; usadas: [] }
  | null {
  if (ev.length === 0) return null;
  if (ev.length === 1) return { selo: "indicativa", area: ev[0]!.area, usadas: [ev[0]!] };
  const areas = ev.map((e) => e.area);
  const c3 = concordantes(areas, CALIBRADA_CONCORDANCIA);
  if (c3.length >= CALIBRADA_MIN_EVIDENCIAS) return { selo: "calibrada", area: median(c3.map((i) => areas[i]!)), usadas: c3.map((i) => ev[i]!) };
  const c8 = concordantes(areas, INDICATIVA_CONCORDANCIA);
  if (c8.length >= 2) return { selo: "indicativa", area: median(c8.map((i) => areas[i]!)), usadas: c8.map((i) => ev[i]!) };
  return { selo: "divergente", usadas: [] };
}

/**
 * Regra 11.9 para os editais de uma planta: um edital, ou 2+ que concordam a 3% da mediana → a área
 * (mediana); 2+ que não concordam → divergente (não confirma). Recebe: editais. Devolve: o resultado ou nulo.
 */
export function editalSeal(ed: readonly EvidenciaEdital[]): { area: number; usados: EvidenciaEdital[] } | { divergente: true } | null {
  if (ed.length === 0) return null;
  const areas = ed.map((e) => e.area);
  if (concordantes(areas, EDITAIS_CONCORDANCIA).length !== ed.length) return { divergente: true };
  return { area: median(areas), usados: [...ed] };
}

/**
 * Regra 11.12 (especial): a planta de maior área IPTU com ≤ 2 unidades e área ≥ 1,4 × a da planta
 * seguinte. Recebe: plantas do prédio. Devolve: o id da planta especial, ou nulo.
 */
export function detectSpecial(plantas: readonly Pick<PlantaEstado, "id" | "areaIptu" | "qtdUnidades">[]): string | null {
  if (plantas.length < 2) return null;
  const [maior, seguinte] = [...plantas].sort((a, b) => b.areaIptu - a.areaIptu);
  return maior!.qtdUnidades <= ESPECIAL_MAX_UNIDADES && maior!.areaIptu >= ESPECIAL_RAZAO_AREA * seguinte!.areaIptu ? maior!.id : null;
}

const SELOS_COM_EVIDENCIA: readonly Selo[] = ["indicativa", "calibrada", "confirmada"];

/**
 * Calibra todas as plantas.
 * Recebe: plantas (estado atual), prédios, evidências de anúncios e de editais já atribuídas às plantas.
 * Devolve: plantas alteradas, histórico, fator_predio e fatores de referência. Passos:
 *  1. evidências (11.9): edital → confirmada (fonte edital_leilao); anúncios → calibrada/indicativa;
 *     edital a mais de 5% da área dos anúncios → revisão edital_divergente (vale o edital, 8.6);
 *  2. fatores de referência (11.10) sobre calibrada/confirmada não especiais;
 *  3. sem evidência → estimada (área IPTU × fator do grupo, com faixa) ou sem_dado;
 *  4. fator_predio = mediana dos fatores ≥ indicativa; coerência a 10% (11.12) → fator_incoerente;
 *  5. especial (11.12): o pipeline só marca, nunca desmarca. A revisão planta_especial abre quando a
 *     planta passa a especial e continua até o admin resolver (interpretação, plans/8.6-calibracao.md);
 *  6. um motivo por planta: edital_divergente > fator_incoerente > anuncios_divergentes > planta_especial.
 * Planta confirmada em revisão manual (11.11) nunca muda, mas o fator dela entra no fator_predio.
 */
export function calibrate(
  plantas: readonly PlantaEstado[],
  predios: readonly PredioInfo[],
  anuncios: readonly EvidenciaAnuncio[],
  editais: readonly EvidenciaEdital[],
): Calibracao {
  const predioPorId = new Map(predios.map((p) => [p.id, p]));
  const porPlanta = <T extends { plantaId: string }>(l: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const x of l) m.set(x.plantaId, [...(m.get(x.plantaId) ?? []), x]);
    return m;
  };
  const anunciosDe = porPlanta(anuncios);
  const editaisDe = porPlanta(editais);
  const plantasDoPredio = new Map<string, PlantaEstado[]>();
  for (const p of plantas) plantasDoPredio.set(p.predioId, [...(plantasDoPredio.get(p.predioId) ?? []), p]);

  // Passo 1: evidências.
  type Trabalho = { novo: PlantaEstado; anunciosIds: string[]; editaisIds: string[]; motivos: Set<MotivoRevisao> };
  const trabalho = new Map<string, Trabalho>();
  for (const p of plantas) {
    if (isLocked(p)) continue; // 11.11
    const predio = predioPorId.get(p.predioId)!;
    const t: Trabalho = { novo: { ...p }, anunciosIds: [], editaisIds: [], motivos: new Set() };
    const ads = adSeal(anunciosDe.get(p.id) ?? []);
    const ed = editalSeal(editaisDe.get(p.id) ?? []);
    if (ads?.selo === "divergente") t.motivos.add("anuncios_divergentes");
    if (ed && "divergente" in ed) t.motivos.add("edital_divergente");

    const vagasAds = ads && ads.selo !== "divergente" ? ads.usadas.map((e) => e.vagas).filter((v): v is number => v !== null) : [];
    const quartosAds = (anunciosDe.get(p.id) ?? []).map((e) => e.quartos).filter((v): v is number => v !== null);
    t.novo.quartos = quartosAds.length ? Math.round(median(quartosAds)) : p.quartos;

    if (ed && "area" in ed) {
      if (ads && ads.selo !== "divergente" && Math.abs(ed.area - ads.area) / ads.area > EDITAL_DIVERGENCIA_ANUNCIOS) t.motivos.add("edital_divergente");
      const vinc = ed.usados.find((e) => e.vagasVinculadas && e.vagas !== null);
      definirArea(t.novo, ed.area, "confirmada", "edital_leilao", null);
      t.novo.vagasInclusas = predio.vagasCadastroProprio ? 0 : vinc ? vinc.vagas : vagasAds.length ? Math.round(median(vagasAds)) : null;
      t.editaisIds = ed.usados.map((e) => e.id);
      t.anunciosIds = ads && ads.selo !== "divergente" ? ads.usadas.map((e) => e.id) : [];
    } else if (ads && ads.selo !== "divergente") {
      const fonte: FonteArea = ads.usadas.some((e) => e.fonte === "anuncio") ? "anuncio" : "pagina_condominio";
      definirArea(t.novo, ads.area, ads.selo, fonte, null);
      t.novo.vagasInclusas = predio.vagasCadastroProprio ? 0 : vagasAds.length ? Math.round(median(vagasAds)) : null;
      t.anunciosIds = ads.usadas.map((e) => e.id);
    } else {
      t.novo.selo = "sem_dado"; // provisório: o passo 3 estima
    }
    trabalho.set(p.id, t);
  }

  // Passo 5 (antes dos fatores, porque especial sai do grupo da 11.10): especial só é marcado.
  const especialNovo = new Set<string>();
  for (const [, doPredio] of plantasDoPredio) {
    const id = detectSpecial(doPredio);
    const t = id ? trabalho.get(id) : undefined;
    if (!t) continue;
    if (!t.novo.especial) especialNovo.add(id!);
    t.novo.especial = true;
  }

  // Passo 2: fatores de referência.
  const estadoFinal = (p: PlantaEstado) => trabalho.get(p.id)?.novo ?? p;
  const fatoresReferencia = computeReferenceFactors(
    plantas.map(estadoFinal)
      .filter((p) => (p.selo === "calibrada" || p.selo === "confirmada") && !p.especial && p.fator !== null)
      .map((p) => {
        const pr = predioPorId.get(p.predioId)!;
        return { fator: p.fator!, bairroId: pr.bairroId, decada: pr.decada, vagasCadastroProprio: pr.vagasCadastroProprio };
      }),
  );

  // Passo 3: estimadas.
  for (const t of trabalho.values()) {
    if (t.novo.selo !== "sem_dado") continue;
    const pr = predioPorId.get(t.novo.predioId)!;
    const g = groupFor(fatoresReferencia, pr.bairroId, pr.decada, pr.vagasCadastroProprio);
    if (g) {
      definirArea(t.novo, t.novo.areaIptu * g.fatorMediano, "estimada", "fator_referencia", errorRangePct(g));
      t.novo.fator = g.fatorMediano; // o fator do grupo, sem o desvio do arredondamento da área
    } else {
      Object.assign(t.novo, { areaPrivativa: null, fator: null, fonteArea: null, faixaErroPct: null });
    }
    t.novo.vagasInclusas = pr.vagasCadastroProprio ? 0 : null;
  }

  // Passo 4: fator_predio e coerência.
  const fatorPredio = new Map<string, number | null>();
  for (const [predioId, doPredio] of plantasDoPredio) {
    const comEvidencia = doPredio.map(estadoFinal).filter((p) => SELOS_COM_EVIDENCIA.includes(p.selo) && p.fator !== null);
    const fp = comEvidencia.length ? r3(median(comEvidencia.map((p) => p.fator!))) : null;
    fatorPredio.set(predioId, fp);
    if (fp === null || comEvidencia.length < COERENCIA_MIN_PLANTAS) continue;
    for (const p of comEvidencia) {
      if (Math.abs(p.fator! - fp) / fp > COERENCIA_FATOR_PREDIO) trabalho.get(p.id)?.motivos.add("fator_incoerente");
    }
  }

  // Passo 6: revisão e diferenças.
  const ORDEM: readonly MotivoRevisao[] = ["edital_divergente", "fator_incoerente", "anuncios_divergentes", "planta_especial"];
  const alteradas: PlantaEstado[] = [];
  const historico: Calibracao["historico"] = [];
  for (const p of plantas) {
    const t = trabalho.get(p.id);
    if (!t) continue;
    const especialPendente = especialNovo.has(p.id) || (p.especial && p.revisaoPendente && p.motivoRevisao === "planta_especial");
    if (especialPendente) t.motivos.add("planta_especial");
    const motivo = ORDEM.find((m) => t.motivos.has(m)) ?? null;
    t.novo.revisaoPendente = motivo !== null;
    t.novo.motivoRevisao = motivo;

    const n = t.novo;
    const mudouArea = n.areaPrivativa !== p.areaPrivativa || n.fator !== p.fator || n.selo !== p.selo || n.fonteArea !== p.fonteArea;
    const mudou = mudouArea || n.vagasInclusas !== p.vagasInclusas || n.quartos !== p.quartos || n.faixaErroPct !== p.faixaErroPct ||
      n.especial !== p.especial || n.revisaoPendente !== p.revisaoPendente || n.motivoRevisao !== p.motivoRevisao;
    if (mudou) alteradas.push(n);
    if (mudouArea) {
      historico.push({
        plantaId: p.id, areaPrivativa: n.areaPrivativa, vagasInclusas: n.vagasInclusas, fator: n.fator, selo: n.selo,
        fonte: n.fonteArea ?? p.fonteArea ?? "fator_referencia", anunciosIds: t.anunciosIds, editaisIds: t.editaisIds,
      });
    }
  }
  return { alteradas, historico, fatorPredio, fatoresReferencia };
}

/** Grava área (2 casas), fator (3 casas), selo, fonte e faixa na planta. */
function definirArea(p: PlantaEstado, area: number, selo: Selo, fonte: FonteArea, faixa: number | null): void {
  p.areaPrivativa = r2(area);
  p.fator = r3(p.areaPrivativa / p.areaIptu);
  p.selo = selo;
  p.fonteArea = fonte;
  p.faixaErroPct = faixa;
}
