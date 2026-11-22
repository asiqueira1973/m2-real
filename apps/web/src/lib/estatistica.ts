/**
 * Resumo das vendas da ficha (prompt-design: "mediana do m² privativo e número de vendas").
 * Função pura. A mediana segue a 11.17: só vendas com m² privativo e fora da curva = false
 * (as fora da curva continuam na lista, com a marca, regra 11.16). Princípio 1 ("nunca m² sem
 * selo") e 11.17: devolve junto a distribuição por selo das vendas que entram na mediana.
 * Recebe: vendas (com o selo, quando a tela vai mostrá-lo). Devolve: n total, n usado na mediana, a
 * mediana (nula sem vendas válidas) e, se as vendas trouxerem o selo, a distribuição por selo.
 */
export function salesSummary(vendas: readonly { m2_privativo: number | null; fora_da_curva: boolean; selo_area?: string }[]): {
  total: number; naMediana: number; mediana: number | null; distribuicao?: Record<string, number>;
} {
  const usadas = vendas.filter((v) => v.m2_privativo !== null && !v.fora_da_curva);
  const validos = usadas.map((v) => Number(v.m2_privativo)).sort((a, b) => a - b);
  const k = Math.floor(validos.length / 2);
  const mediana = validos.length === 0 ? null : validos.length % 2 ? validos[k]! : (validos[k - 1]! + validos[k]!) / 2;
  const resumo = { total: vendas.length, naMediana: validos.length, mediana };
  if (!vendas.some((v) => v.selo_area !== undefined)) return resumo;
  const distribuicao: Record<string, number> = {};
  for (const v of usadas) if (v.selo_area) distribuicao[v.selo_area] = (distribuicao[v.selo_area] ?? 0) + 1;
  return { ...resumo, distribuicao };
}

/**
 * Data AAAA-MM-DD de n meses antes, como o current_date - interval do Postgres: o dia que não
 * existe no mês de destino vira o último dia dele (31/03 − 1 mês = 28/02). Mantém a ficha e a
 * lista de prédios (m2_listar_predios) com a mesma janela. Recebe: instante e meses. Devolve: a data.
 */
export function monthsBefore(agora: Date, meses: number): string {
  const ano = agora.getUTCFullYear();
  const mes = agora.getUTCMonth() - meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(agora.getUTCDate(), ultimoDia))).toISOString().slice(0, 10);
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
