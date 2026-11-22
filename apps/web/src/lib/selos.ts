/**
 * Selos de área no painel (seções 15 e 16; regra 11.9). Funções puras.
 */
export type Selo = "confirmada" | "calibrada" | "indicativa" | "estimada" | "sem_dado";

/** Do pior para o melhor (mesma ordem da regra 11.13 e de m2_listar_predios). */
export const SELOS: readonly Selo[] = ["sem_dado", "estimada", "indicativa", "calibrada", "confirmada"];

/** Rótulos da seção 15: Confirmada, Calibrada, Indicativa, Estimada, Sem dado. */
export const ROTULO_SELO: Readonly<Record<Selo, string>> = {
  confirmada: "Confirmada", calibrada: "Calibrada", indicativa: "Indicativa", estimada: "Estimada", sem_dado: "Sem dado",
};

/**
 * Seção 16: Confirmada mostra a fonte ("revisão" ou "edital").
 * Recebe: selo e fonte da área. Devolve: o complemento do rótulo, ou nulo.
 */
export function confirmedSource(selo: Selo, fonte: string | null | undefined): string | null {
  if (selo !== "confirmada") return null;
  if (fonte === "revisao_manual") return "revisão";
  if (fonte === "edital_leilao") return "edital";
  return null;
}

/** Recebe: texto qualquer. Devolve: o selo, se for um dos 5; senão nulo (filtro da URL). */
export function parseSelo(v: string | null | undefined): Selo | null {
  return v && (SELOS as readonly string[]).includes(v) ? (v as Selo) : null;
}
