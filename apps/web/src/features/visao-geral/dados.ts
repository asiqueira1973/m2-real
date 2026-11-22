/**
 * Dados da Visão geral (seção 10): última cobertura de cada bairro (D12) e última execução de
 * cada rotina (4.4). Lidos com a sessão do admin (RLS). Recebe: nada. Devolve: as duas listas.
 */
import { createSessionClient } from "@/lib/supabase/servidor";

export async function loadOverview() {
  const supabase = await createSessionClient();
  const [cobertura, execucoes] = await Promise.all([supabase.rpc("m2_cobertura_atual"), supabase.rpc("m2_ultimas_execucoes")]);
  if (cobertura.error) throw new Error(`Falha ao ler a cobertura: ${cobertura.error.message}`);
  if (execucoes.error) throw new Error(`Falha ao ler as execuções: ${execucoes.error.message}`);
  return { cobertura: cobertura.data, execucoes: execucoes.data };
}

/** Rotinas da seção 4.4, na ordem da faixa da Visão geral, com o rótulo do prompt-design. */
export const ROTINAS_VISAO = [
  { rotina: "ingestao-itbi", rotulo: "ITBI" },
  { rotina: "ingestao-iptu", rotulo: "IPTU" },
  { rotina: "coleta-anuncios", rotulo: "Coleta de anúncios" },
  { rotina: "coleta-leiloes", rotulo: "Coleta de leilões" },
  { rotina: "calibracao", rotulo: "Calibração" },
] as const;
