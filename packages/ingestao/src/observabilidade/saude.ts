/**
 * Saúde das cargas recorrentes (observabilidade O2; acréscimo pedido pelo usuário em
 * 21/11/2026, plans/8.2-iptu.md). Função pura: recebe o histórico de execuções e de
 * cobertura e diz, por rotina, se está tudo bem. Usada pela rotina "vigia" (O3, alerta
 * por e-mail do GitHub), pelo painel (O4) e pelo MCP (O5, dados_desatualizados).
 */
import {
  EXECUCAO_TEMPO_ESGOTADO_HORAS,
  ROTINAS,
  SAUDE_ATRASO_MAXIMO_DIAS,
  SAUDE_QUEDA_COBERTURA_PONTOS,
  SAUDE_VOLUME_FRACAO_MINIMA,
  SAUDE_VOLUME_JANELA_EXECUCOES,
  type Rotina,
} from "../config/regras";

export type StatusExecucao = "em_andamento" | "concluida" | "falhou" | "substituida";
export type EstadoSaude = "ok" | "atrasada" | "falhou" | "travada" | "volume_anomalo" | "nunca_executada";

/** Campos de m2_execucoes_ingestao usados na avaliação. */
export interface ExecucaoResumo {
  rotina: string;
  status: StatusExecucao;
  iniciada_em: string;
  concluida_em: string | null;
  linhas_gravadas: number;
  mensagem_erro: string | null;
  /** "sem mudança" (8.3) não conta como volume anômalo. */
  sem_mudanca?: boolean;
  /** Ano/exercício da carga (ITBI, IPTU). O volume só se compara dentro da mesma referência. */
  referencia?: string | null;
}

/** Campos de m2_cobertura_bairros usados na avaliação. */
export interface CoberturaResumo {
  bairro_id: number;
  calculado_em: string;
  pct_cobertura: number;
}

export interface SaudeRotina {
  rotina: Rotina;
  estado: EstadoSaude;
  motivo: string | null;
  ultima_concluida_em: string | null;
}

export interface AlertaCobertura {
  bairro_id: number;
  queda_pontos: number;
  motivo: string;
}

export interface RelatorioSaude {
  ok: boolean;
  rotinas: SaudeRotina[];
  cobertura: AlertaCobertura[];
  /** Frases curtas para e-mail, painel e MCP. Vazio quando ok. */
  motivos: string[];
}

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/**
 * Avalia a saúde das rotinas da seção 4.4.
 * Recebe: execuções (qualquer ordem), fotos de cobertura e o instante de referência.
 * Devolve: estado por rotina (pior estado vence), alertas de queda de cobertura e a lista
 * de motivos. Ordem de gravidade: travada > falhou > atrasada/nunca_executada > volume_anomalo > ok.
 * Regras: seção 12 (6 h = travada) e limiares de observabilidade em config/regras.ts.
 */
export function avaliarSaude(
  execucoes: readonly ExecucaoResumo[],
  coberturas: readonly CoberturaResumo[],
  agora: Date,
): RelatorioSaude {
  const rotinas = ROTINAS.map((r) => avaliarRotina(r, execucoes.filter((e) => e.rotina === r), agora));
  const cobertura = avaliarCobertura(coberturas);
  const motivos = [
    ...rotinas.filter((r) => r.estado !== "ok").map((r) => r.motivo!),
    ...cobertura.map((c) => c.motivo),
  ];
  return { ok: motivos.length === 0, rotinas, cobertura, motivos };
}

/**
 * Avalia uma rotina (observabilidade O2).
 * Recebe: nome da rotina, execuções dela e o instante. Devolve: estado e motivo legível.
 * Ordem: travada (seção 12, > 6 h) → falhou → nunca_executada → atrasada → volume_anomalo → ok.
 */
function avaliarRotina(rotina: Rotina, execs: readonly ExecucaoResumo[], agora: Date): SaudeRotina {
  const ordenadas = [...execs].sort((a, b) => Date.parse(b.iniciada_em) - Date.parse(a.iniciada_em));
  const concluidas = ordenadas.filter((e) => e.status === "concluida");
  const ultimaConcluida = concluidas[0] ?? null;
  const base = { rotina, ultima_concluida_em: ultimaConcluida?.concluida_em ?? null };

  // Seção 12: em_andamento há mais de 6 h está travada (a próxima execução a marcará falhou).
  const travada = ordenadas.find(
    (e) => e.status === "em_andamento" && agora.getTime() - Date.parse(e.iniciada_em) > EXECUCAO_TEMPO_ESGOTADO_HORAS * HORA_MS,
  );
  if (travada) {
    return { ...base, estado: "travada", motivo: `${rotina}: execução em andamento há mais de ${EXECUCAO_TEMPO_ESGOTADO_HORAS} h` };
  }

  // A execução mais recente que terminou falhou.
  const ultimaTerminada = ordenadas.find((e) => e.status === "concluida" || e.status === "falhou");
  if (ultimaTerminada?.status === "falhou") {
    return { ...base, estado: "falhou", motivo: `${rotina}: última execução falhou (${ultimaTerminada.mensagem_erro ?? "sem mensagem"})` };
  }

  if (!ultimaConcluida?.concluida_em) {
    return { ...base, estado: "nunca_executada", motivo: `${rotina}: nenhuma execução concluída` };
  }

  const dias = (agora.getTime() - Date.parse(ultimaConcluida.concluida_em)) / DIA_MS;
  const limite = SAUDE_ATRASO_MAXIMO_DIAS[rotina];
  if (dias > limite) {
    return { ...base, estado: "atrasada", motivo: `${rotina}: sem carga concluída há ${Math.floor(dias)} dias (limite ${limite})` };
  }

  // Volume: a última concluída com mudança contra a mediana das N anteriores com mudança DA MESMA
  // referência (o ITBI de um ano parcial não se compara com anos inteiros; bug achado pela vigia no 8.8).
  const comMudanca = concluidas.filter((e) => !e.sem_mudanca);
  const [atual, ...todasAnteriores] = comMudanca;
  const anteriores = todasAnteriores.filter((e) => (e.referencia ?? null) === (atual?.referencia ?? null));
  const janela = anteriores.slice(0, SAUDE_VOLUME_JANELA_EXECUCOES).map((e) => e.linhas_gravadas);
  if (atual && janela.length === SAUDE_VOLUME_JANELA_EXECUCOES) {
    const med = mediana(janela);
    if (med > 0 && atual.linhas_gravadas < SAUDE_VOLUME_FRACAO_MINIMA * med) {
      return {
        ...base,
        estado: "volume_anomalo",
        motivo: `${rotina}: gravou ${atual.linhas_gravadas} linhas, menos de ${SAUDE_VOLUME_FRACAO_MINIMA * 100}% da mediana recente (${med})`,
      };
    }
  }
  return { ...base, estado: "ok", motivo: null };
}

/**
 * Queda de cobertura por bairro entre as duas fotos mais recentes (D12; observabilidade O2).
 * Recebe: fotos de m2_cobertura_bairros. Devolve: alertas com queda > SAUDE_QUEDA_COBERTURA_PONTOS.
 */
function avaliarCobertura(coberturas: readonly CoberturaResumo[]): AlertaCobertura[] {
  const porBairro = new Map<number, CoberturaResumo[]>();
  for (const c of coberturas) porBairro.set(c.bairro_id, [...(porBairro.get(c.bairro_id) ?? []), c]);
  const alertas: AlertaCobertura[] = [];
  for (const [bairro_id, fotos] of porBairro) {
    const [atual, anterior] = [...fotos].sort((a, b) => Date.parse(b.calculado_em) - Date.parse(a.calculado_em));
    if (!atual || !anterior) continue;
    const queda = Math.round((anterior.pct_cobertura - atual.pct_cobertura) * 10) / 10;
    if (queda > SAUDE_QUEDA_COBERTURA_PONTOS) {
      alertas.push({
        bairro_id,
        queda_pontos: queda,
        motivo: `cobertura do bairro ${bairro_id} caiu ${queda} pontos (${anterior.pct_cobertura}% → ${atual.pct_cobertura}%)`,
      });
    }
  }
  return alertas;
}

/** Mediana de uma lista não vazia. Recebe: números. Devolve: a mediana. */
function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
