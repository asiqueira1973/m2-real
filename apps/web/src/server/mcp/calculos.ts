/**
 * Cálculos do servidor MCP (seção 13.2; regra 11.17; princípio 1). Funções puras, testadas sem banco.
 */
import { MCP_COMPARAVEIS_DECADAS, MCP_COMPARAVEIS_FAIXA_AREA, MEDIANA_SELOS } from "@m2-real/ingestao/regras";

/** Venda como sai das ferramentas (13.2: "lista { data, unidade, valor_total, … }"). */
export interface VendaMcp {
  data: string;
  unidade: string | null;
  valor_total: number;
  valor_apartamento: number;
  valor_vagas: number;
  area_privativa: number | null;
  selo_area: string;
  m2_privativo: number | null;
  m2_iptu: number;
  vagas_inclusas_area: number | null;
  fora_da_curva: boolean;
}

/** Percentil por interpolação linear (o mesmo do percentile_cont do Postgres). */
function percentil(ordenados: readonly number[], p: number): number {
  const pos = (ordenados.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return ordenados[lo]! + (ordenados[hi]! - ordenados[lo]!) * (pos - lo);
}

const reais = (n: number) => Math.round(n);

/**
 * Regra 11.17: m² mediano = mediana de m2_privativo das vendas de compra e venda (todas as vendas
 * consolidadas são), não fora da curva, com selo ≥ estimada. Sempre devolve junto: n, distribuição
 * por selo e se há vagas inclusas na área. Princípio 1: a mediana nunca sai sem os selos que a formam.
 * Recebe: vendas. Devolve: o resumo (mediana/p25/p75 nulos sem vendas válidas).
 */
export function medianSummary(vendas: readonly Pick<VendaMcp, "m2_privativo" | "fora_da_curva" | "selo_area" | "vagas_inclusas_area">[]) {
  const validas = vendas.filter((v) => v.m2_privativo !== null && !v.fora_da_curva && (MEDIANA_SELOS as readonly string[]).includes(v.selo_area));
  const m2 = validas.map((v) => Number(v.m2_privativo)).sort((a, b) => a - b);
  const distribuicao_selos: Record<string, number> = {};
  for (const v of validas) distribuicao_selos[v.selo_area] = (distribuicao_selos[v.selo_area] ?? 0) + 1;
  return {
    mediana_m2_privativo: m2.length ? reais(percentil(m2, 0.5)) : null,
    p25: m2.length ? reais(percentil(m2, 0.25)) : null,
    p75: m2.length ? reais(percentil(m2, 0.75)) : null,
    n_vendas: m2.length,
    distribuicao_selos,
    com_vagas_inclusas: validas.filter((v) => (v.vagas_inclusas_area ?? 0) > 0).length,
  };
}

/** Década de construção (1970, 1980…). */
export function decade(ano: number | null): number | null {
  return ano === null ? null : Math.floor(ano / 10) * 10;
}

/** Candidata a comparável: a venda e o prédio dela. */
export interface Candidata extends VendaMcp {
  predio_id: string;
  logradouro: string;
  numero: number | null;
  ano_construcao: number | null;
}

/**
 * 13.2 comparaveis: vendas do mesmo bairro (o filtro de bairro e de janela vem da consulta) com área
 * privativa a ±20% da referência e década de construção a ±1; ordenadas primeiro pela mesma rua,
 * depois pelas mais recentes. Recebe: candidatas, área de referência, década e logradouro do prédio,
 * id do prédio (excluído) e limite. Devolve: as comparáveis.
 */
export function pickComparables(
  candidatas: readonly Candidata[],
  areaReferencia: number,
  decadaPredio: number | null,
  logradouro: string,
  predioId: string,
  limite: number,
): Candidata[] {
  const min = areaReferencia * (1 - MCP_COMPARAVEIS_FAIXA_AREA);
  const max = areaReferencia * (1 + MCP_COMPARAVEIS_FAIXA_AREA);
  return candidatas
    .filter((c) => c.predio_id !== predioId && c.area_privativa !== null && c.area_privativa >= min && c.area_privativa <= max)
    .filter((c) => {
      if (decadaPredio === null) return true; // sem ano do prédio, não há como filtrar a década
      const d = decade(c.ano_construcao);
      return d !== null && Math.abs(d - decadaPredio) <= MCP_COMPARAVEIS_DECADAS * 10;
    })
    .sort((a, b) => Number(b.logradouro === logradouro) - Number(a.logradouro === logradouro) || b.data.localeCompare(a.data))
    .slice(0, limite);
}

/**
 * Princípio 1: confere que todo campo m2_* de um objeto vem com selo e com a área usada. Usado nos
 * testes sobre as respostas das ferramentas. Recebe: qualquer valor. Devolve: os caminhos com problema.
 */
export function m2WithoutSeal(valor: unknown, caminho = "$"): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => m2WithoutSeal(v, `${caminho}[${i}]`));
  if (!valor || typeof valor !== "object") return [];
  const o = valor as Record<string, unknown>;
  const problemas: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === "m2_privativo" && v !== null && !("selo_area" in o && "area_privativa" in o)) problemas.push(`${caminho}.${k}`);
    if (k === "mediana_m2_privativo" && v !== null && !("distribuicao_selos" in o)) problemas.push(`${caminho}.${k}`);
    problemas.push(...m2WithoutSeal(v, `${caminho}.${k}`));
  }
  return problemas;
}
