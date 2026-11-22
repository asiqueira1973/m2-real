/**
 * Leitura do histórico para a avaliação de saúde (observabilidade O2–O4; épico 8.8).
 * Serve à rotina "vigia" (service role) e ao painel (sessão do admin): recebe qualquer cliente
 * tipado do banco. As leituras são limitadas (bem abaixo do max_rows de 1.000).
 */
import type { M2Client } from "@m2-real/db";
import { VIGIA_COBERTURAS_LIDAS, VIGIA_EXECUCOES_LIDAS } from "../config/regras.js";
import { withRetry } from "../shared/retry.js";
import { avaliarSaude, type CoberturaResumo, type ExecucaoResumo, type RelatorioSaude } from "./saude.js";

/**
 * Lê as execuções e as fotos de cobertura mais recentes e avalia a saúde.
 * "Sem mudança" do ITBI (8.3: hash igual, 0 linhas lidas) não conta como volume anômalo.
 * Recebe: cliente e o instante. Devolve: o relatório de avaliarSaude.
 */
export async function loadHealth(db: M2Client, agora: Date = new Date()): Promise<RelatorioSaude> {
  const execucoes = await withRetry<{ rotina: string; referencia: string | null; status: ExecucaoResumo["status"]; iniciada_em: string; concluida_em: string | null; linhas_lidas: number; linhas_gravadas: number; mensagem_erro: string | null }[]>(
    () => db.from("m2_execucoes_ingestao")
      .select("rotina, referencia, status, iniciada_em, concluida_em, linhas_lidas, linhas_gravadas, mensagem_erro")
      .order("iniciada_em", { ascending: false }).limit(VIGIA_EXECUCOES_LIDAS),
    "Falha ao ler execuções (saúde)",
  );
  const coberturas = await withRetry<{ bairro_id: number; calculado_em: string; pct_cobertura: number }[]>(
    () => db.from("m2_cobertura_bairros").select("bairro_id, calculado_em, pct_cobertura")
      .order("calculado_em", { ascending: false }).limit(VIGIA_COBERTURAS_LIDAS),
    "Falha ao ler cobertura (saúde)",
  );
  const resumo: ExecucaoResumo[] = execucoes.map((e) => ({
    ...e, sem_mudanca: e.rotina === "ingestao-itbi" && e.status === "concluida" && e.linhas_lidas === 0,
  }));
  const fotos: CoberturaResumo[] = coberturas.map((c) => ({ ...c, pct_cobertura: Number(c.pct_cobertura) }));
  return avaliarSaude(resumo, fotos, agora);
}
