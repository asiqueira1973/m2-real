/**
 * Formatos brasileiros do painel (seção 16: "R$ 1.630.000; 94 m²; R$ 17.340/m²"). Funções puras.
 * Nulo vira "—".
 */
const SEM = "—";
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = (casas: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

/** Reais sem centavos: 1630000 → "R$ 1.630.000". */
export function reais(v: number | null | undefined): string {
  return v == null ? SEM : `R$ ${inteiro.format(Math.round(v))}`;
}

/** Área: 94 → "94 m²"; 94.5 → "94,5 m²" (até 2 casas). */
export function area(v: number | null | undefined): string {
  return v == null ? SEM : `${decimal(2).format(v)} m²`;
}

/** Preço por m²: 17340.2 → "R$ 17.340/m²". */
export function reaisPorM2(v: number | null | undefined): string {
  return v == null ? SEM : `R$ ${inteiro.format(Math.round(v))}/m²`;
}

/** Fator (3 casas): 0.72 → "0,720". */
export function fator(v: number | null | undefined): string {
  return v == null ? SEM : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
}

/** Percentual com 1 casa: 33.3 → "33,3%". */
export function percentual(v: number | null | undefined): string {
  return v == null ? SEM : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
}

/** Inteiro com milhar: 53161 → "53.161". */
export function numero(v: number | null | undefined): string {
  return v == null ? SEM : inteiro.format(v);
}

/** Data AAAA-MM-DD ou ISO → "14/11/2025" (sem fuso: a data do ITBI é civil). */
export function data(v: string | null | undefined): string {
  if (!v) return SEM;
  const [a, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Data e hora em São Paulo: ISO → "22/11/2026 13:20". */
export function dataHora(v: string | null | undefined): string {
  if (!v) return SEM;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(v));
}
