/**
 * Indicador de cobertura por bairro (D12; 7.2 m2_cobertura_bairros; épico 8.6). Função pura.
 */
import { COBERTURA_JANELA_MESES } from "../config/regras.js";
import type { Selo } from "./consolidar.js";

export interface LinhaCobertura {
  bairroId: number;
  vendas24m: number;
  vendasConfirmada: number;
  vendasCalibrada: number;
  vendasIndicativa: number;
  vendasEstimada: number;
  vendasSemDado: number;
  pctCobertura: number;
}

/**
 * Uma linha por bairro (mesmo sem vendas), com as vendas consolidadas dos últimos 24 meses contadas
 * pelo selo da área. pct_cobertura = (confirmada + calibrada) / vendas_24m × 100, com 1 casa;
 * indicativa não entra (P4, decisão do usuário). Sem vendas, 0.
 * Recebe: ids dos bairros, vendas (bairro, data AAAA-MM-DD, selo) e o instante. Devolve: as linhas.
 */
export function computeCoverage(
  bairros: readonly number[],
  vendas: readonly { bairroId: number; dataTransacao: string; seloArea: Selo }[],
  agora: Date,
): LinhaCobertura[] {
  const desde = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - COBERTURA_JANELA_MESES, agora.getUTCDate())).toISOString().slice(0, 10);
  const linhas = new Map<number, LinhaCobertura>(bairros.map((b) => [b, {
    bairroId: b, vendas24m: 0, vendasConfirmada: 0, vendasCalibrada: 0, vendasIndicativa: 0, vendasEstimada: 0, vendasSemDado: 0, pctCobertura: 0,
  }]));
  const campo: Record<Selo, keyof LinhaCobertura> = {
    confirmada: "vendasConfirmada", calibrada: "vendasCalibrada", indicativa: "vendasIndicativa", estimada: "vendasEstimada", sem_dado: "vendasSemDado",
  };
  for (const v of vendas) {
    const l = linhas.get(v.bairroId);
    if (!l || v.dataTransacao < desde) continue;
    l.vendas24m++;
    (l[campo[v.seloArea]] as number)++;
  }
  for (const l of linhas.values()) {
    l.pctCobertura = l.vendas24m ? Math.round(((l.vendasConfirmada + l.vendasCalibrada) / l.vendas24m) * 1000) / 10 : 0;
  }
  return [...linhas.values()];
}
