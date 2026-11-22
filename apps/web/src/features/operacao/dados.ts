/**
 * Dados das telas de operação (seção 10; critérios 4 e 5 do 8.8; O4), com a sessão do admin.
 */
import { loadHealth } from "@m2-real/ingestao/saude";
import { createSessionClient } from "@/lib/supabase/servidor";

/** Seção 10: "últimas 50 execuções". */
export const EXECUCOES_LISTADAS = 50;

/**
 * Execuções e saúde por rotina (O4). Recebe: filtros de rotina e status (nulos = todos).
 * Devolve: as últimas 50 execuções e o relatório de saúde (o mesmo da vigia).
 */
export async function loadExecutions(rotina: string | null, status: string | null) {
  const supabase = await createSessionClient();
  let q = supabase.from("m2_execucoes_ingestao")
    .select("id, rotina, fonte, referencia, status, iniciada_em, concluida_em, linhas_lidas, linhas_gravadas, linhas_descartadas, mensagem_erro");
  if (rotina) q = q.eq("rotina", rotina);
  if (status) q = q.eq("status", status as never);
  const [execucoes, saude] = await Promise.all([q.order("iniciada_em", { ascending: false }).limit(EXECUCOES_LISTADAS), loadHealth(supabase as never)]);
  if (execucoes.error) throw new Error(`Falha ao ler execuções: ${execucoes.error.message}`);
  return { execucoes: execucoes.data, saude };
}

/** Chaves de API (critério 5): lista pelo prefixo; o hash nunca é lido pelo painel. */
export async function loadKeys() {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("m2_chaves_api").select("id, nome, prefixo, ativa, criado_em, ultimo_uso_em").order("criado_em", { ascending: false }).limit(200);
  if (error) throw new Error(`Falha ao ler chaves: ${error.message}`);
  return data;
}
