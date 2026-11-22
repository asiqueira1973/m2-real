/**
 * Regra 11.13: prioridade de coleta e escolha dos prédios da rodada (funções puras).
 */
import { COLETA_MAX_PREDIOS, COLETA_RECOLETA_DIAS, PRIORIDADE_PESO_SELO } from "../config/regras.js";

export type SeloPlanta = keyof typeof PRIORIDADE_PESO_SELO;

/** Ordem do pior para o melhor selo (o pior define o peso). */
const ORDEM_PIOR: readonly SeloPlanta[] = ["sem_dado", "estimada", "indicativa", "calibrada", "confirmada"];

/**
 * prioridade_coleta = vendas de compra e venda dos últimos 24 meses × peso do pior selo.
 * Recebe: quantidade de vendas na janela e os selos das plantas do prédio. Devolve: a prioridade
 * (0 quando todas as plantas já estão calibradas/confirmadas, ou sem vendas).
 */
export function collectionPriority(vendas24m: number, selos: readonly SeloPlanta[]): number {
  const pior = ORDEM_PIOR.find((s) => selos.includes(s)) ?? "sem_dado";
  return vendas24m * PRIORIDADE_PESO_SELO[pior];
}

export interface PredioCandidato {
  id: string;
  prioridade: number;
  ultimaColetaEm: string | null;
}

/**
 * Prédios da rodada: os de maior prioridade (> 0), com coleta nula ou de mais de 90 dias,
 * no máximo COLETA_MAX_PREDIOS. Recebe: candidatos e o instante. Devolve: ids, do mais prioritário.
 */
export function pickBuildings(predios: readonly PredioCandidato[], agora: Date, limite = COLETA_MAX_PREDIOS): string[] {
  const corte = agora.getTime() - COLETA_RECOLETA_DIAS * 86_400_000;
  return predios
    .filter((p) => p.prioridade > 0 && (p.ultimaColetaEm === null || Date.parse(p.ultimaColetaEm) < corte))
    .sort((a, b) => b.prioridade - a.prioridade || a.id.localeCompare(b.id))
    .slice(0, limite)
    .map((p) => p.id);
}
