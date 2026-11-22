/**
 * Resumo das vendas da ficha (prompt-design: "mediana do m² privativo e número de vendas").
 * Função pura. A mediana segue a 11.17: só vendas com m² privativo e fora da curva = false
 * (as fora da curva continuam na lista, com a marca, regra 11.16).
 * Recebe: vendas. Devolve: n total, n usado na mediana e a mediana (nula sem vendas válidas).
 */
export function salesSummary(vendas: readonly { m2_privativo: number | null; fora_da_curva: boolean }[]) {
  const validos = vendas.filter((v) => v.m2_privativo !== null && !v.fora_da_curva).map((v) => Number(v.m2_privativo)).sort((a, b) => a - b);
  const k = Math.floor(validos.length / 2);
  const mediana = validos.length === 0 ? null : validos.length % 2 ? validos[k]! : (validos[k - 1]! + validos[k]!) / 2;
  return { total: vendas.length, naMediana: validos.length, mediana };
}

/** Períodos do filtro de vendas da ficha (seção 10: "período nas vendas"); null = todas. */
export const PERIODOS_VENDAS = [
  { valor: "12", rotulo: "12 meses", meses: 12 },
  { valor: "24", rotulo: "24 meses", meses: 24 },
  { valor: "36", rotulo: "36 meses", meses: 36 },
  { valor: "60", rotulo: "5 anos", meses: 60 },
  { valor: "todas", rotulo: "Todas", meses: null },
] as const;

/**
 * Recebe: o parâmetro ?meses e o padrão (a janela da cobertura, 24). Devolve: meses do período
 * (nulo = todas as vendas).
 */
export function parsePeriod(v: string | undefined, padrao: number): number | null {
  const p = PERIODOS_VENDAS.find((x) => x.valor === v);
  return p ? p.meses : padrao;
}
