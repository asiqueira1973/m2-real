/**
 * Regra 11.10: fatores de referência por grupo (funções puras; épico 8.6).
 * Grupos, do mais específico ao mais geral: (bairro, década, vagas_cadastro_proprio) →
 * (década, vagas_cadastro_proprio) → (vagas_cadastro_proprio). Usa o mais específico com ≥ 8 plantas.
 */
import { FATOR_GRUPO_MIN_PLANTAS } from "../config/regras.js";

/** Planta calibrada/confirmada, não especial, que entra no cálculo dos grupos. */
export interface PlantaParaFator {
  fator: number;
  bairroId: number;
  decada: number | null;
  vagasCadastroProprio: boolean;
}

/** Linha de m2_fatores_referencia (7.2). bairroId/decada nulos = "todos". */
export interface FatorReferencia {
  bairroId: number | null;
  decada: number | null;
  vagasCadastroProprio: boolean;
  fatorMediano: number;
  fatorP25: number;
  fatorP75: number;
  qtdPlantas: number;
}

/** Década de construção (1960, 1970…) a partir do ano; nula sem ano. */
export function decadeOf(ano: number | null): number | null {
  return ano === null ? null : Math.floor(ano / 10) * 10;
}

/**
 * Percentil por interpolação linear entre as posições (mesmo método do percentile_cont do Postgres).
 * Recebe: valores ordenados (não vazio) e p entre 0 e 1. Devolve: o percentil.
 */
export function percentile(ordenados: readonly number[], p: number): number {
  const pos = (ordenados.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return ordenados[lo]! + (ordenados[hi]! - ordenados[lo]!) * (pos - lo);
}

/** Arredonda para as casas de numeric(5,3). */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Calcula os grupos da regra 11.10.
 * Recebe: plantas calibradas/confirmadas não especiais (o filtro é de quem chama).
 * Devolve: só os grupos com ≥ FATOR_GRUPO_MIN_PLANTAS plantas (os outros não podem ser usados).
 * Plantas de prédio sem ano entram só no grupo geral (sem década não há grupo de década).
 */
export function computeReferenceFactors(plantas: readonly PlantaParaFator[]): FatorReferencia[] {
  const grupos = new Map<string, { bairroId: number | null; decada: number | null; vcp: boolean; fatores: number[] }>();
  const somar = (bairroId: number | null, decada: number | null, vcp: boolean, fator: number) => {
    const k = `${bairroId}|${decada}|${vcp}`;
    const g = grupos.get(k) ?? { bairroId, decada, vcp, fatores: [] };
    g.fatores.push(fator);
    grupos.set(k, g);
  };
  for (const p of plantas) {
    if (p.decada !== null) {
      somar(p.bairroId, p.decada, p.vagasCadastroProprio, p.fator);
      somar(null, p.decada, p.vagasCadastroProprio, p.fator);
    }
    somar(null, null, p.vagasCadastroProprio, p.fator);
  }
  return [...grupos.values()]
    .filter((g) => g.fatores.length >= FATOR_GRUPO_MIN_PLANTAS)
    .map((g) => {
      const s = [...g.fatores].sort((a, b) => a - b);
      return {
        bairroId: g.bairroId, decada: g.decada, vagasCadastroProprio: g.vcp,
        fatorMediano: r3(percentile(s, 0.5)), fatorP25: r3(percentile(s, 0.25)), fatorP75: r3(percentile(s, 0.75)),
        qtdPlantas: s.length,
      };
    });
}

/**
 * Grupo mais específico disponível para um prédio (11.10).
 * Recebe: grupos gravados (todos com ≥ 8 plantas) e os atributos do prédio. Devolve: o grupo ou nulo.
 */
export function groupFor(
  fatores: readonly FatorReferencia[],
  bairroId: number,
  decada: number | null,
  vagasCadastroProprio: boolean,
): FatorReferencia | null {
  const achar = (b: number | null, d: number | null) =>
    fatores.find((f) => f.bairroId === b && f.decada === d && f.vagasCadastroProprio === vagasCadastroProprio && f.qtdPlantas >= FATOR_GRUPO_MIN_PLANTAS);
  return (decada !== null ? achar(bairroId, decada) ?? achar(null, decada) : undefined) ?? achar(null, null) ?? null;
}

/** Regra 11.10: faixa_erro_pct = (p75 − p25) / mediana × 100 / 2, com 1 casa (numeric(5,1)). */
export function errorRangePct(f: FatorReferencia): number {
  return Math.round(((f.fatorP75 - f.fatorP25) / f.fatorMediano) * 100 / 2 * 10) / 10;
}
