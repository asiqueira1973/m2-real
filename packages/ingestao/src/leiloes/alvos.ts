/**
 * Regra 11.19: alvos da coleta de leilões (função pura; épico 8.5.1).
 */
import { LEILAO_ALVOS_MAX_PRIORIDADE, LEILAO_MAX_ALVOS_PADRAO, LEILAO_RECOLETA_DIAS } from "../config/regras.js";

export interface PredioCandidatoLeilao {
  id: string;
  /** prioridade_coleta gravada pela regra 11.13. */
  prioridade: number;
  ultimaColetaLeilaoEm: string | null;
  /** O prédio tem ao menos uma planta com selo confirmada. */
  temPlantaConfirmada: boolean;
}

/**
 * Escolhe os prédios da rodada.
 * Recebe:
 *  - os candidatos;
 *  - arrematacoes: prédio → data (AAAA-MM-DD) da guia de leilão mais recente nos últimos 36 meses
 *    (naturezas 4. e 17.; o filtro de natureza e de janela é feito na leitura, em rotina.ts);
 *  - o instante e o teto de alvos (LEILAO_MAX_ALVOS_EXECUCAO).
 * Devolve: ids, primeiro os de (a), da guia mais recente para a mais antiga, depois os de (b),
 * da maior prioridade para a menor.
 * Regra 11.19:
 *  - (a) prédios com guia de arrematação ou de consolidação fiduciária nos últimos 36 meses;
 *  - (b) os 100 prédios de maior prioridade_coleta sem nenhuma planta confirmada;
 *  - só prédios com ultima_coleta_leilao_em nula ou de mais de 180 dias.
 * O filtro dos 180 dias vem antes do corte dos 100 de (b): assim a rodada seguinte pega os próximos
 * da fila em vez de ficar vazia por 180 dias (interpretação declarada em plans/8.5.1-leiloes.md).
 */
export function pickAuctionTargets(
  predios: readonly PredioCandidatoLeilao[],
  arrematacoes: ReadonlyMap<string, string>,
  agora: Date,
  limite = LEILAO_MAX_ALVOS_PADRAO,
): string[] {
  const corte = agora.getTime() - LEILAO_RECOLETA_DIAS * 86_400_000;
  const elegiveis = predios.filter((p) => p.ultimaColetaLeilaoEm === null || Date.parse(p.ultimaColetaLeilaoEm) < corte);

  const a = elegiveis
    .filter((p) => arrematacoes.has(p.id))
    .sort((x, y) => arrematacoes.get(y.id)!.localeCompare(arrematacoes.get(x.id)!) || x.id.localeCompare(y.id))
    .map((p) => p.id);
  const b = elegiveis
    .filter((p) => !p.temPlantaConfirmada)
    .sort((x, y) => y.prioridade - x.prioridade || x.id.localeCompare(y.id))
    .slice(0, LEILAO_ALVOS_MAX_PRIORIDADE)
    .map((p) => p.id);

  return [...new Set([...a, ...b])].slice(0, limite);
}
