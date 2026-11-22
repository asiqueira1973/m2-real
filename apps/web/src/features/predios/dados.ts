/**
 * Dados da tela Prédios (seção 10): bairros para o filtro e a página de m2_listar_predios.
 * Lidos com a sessão do admin (RLS). Recebe: filtros. Devolve: bairros, linhas e total.
 */
import { COBERTURA_JANELA_MESES } from "@m2-real/ingestao/regras";
import { toRpcArgs, type FiltrosPredios } from "@/lib/filtros";
import { createSessionClient } from "@/lib/supabase/servidor";

export async function loadBuildings(f: FiltrosPredios) {
  const supabase = await createSessionClient();
  const [bairros, predios] = await Promise.all([
    supabase.from("m2_bairros").select("id, nome").order("nome"),
    // A janela de "vendas 24m" é a mesma da cobertura (D12; regras.ts).
    supabase.rpc("m2_listar_predios", toRpcArgs(f, COBERTURA_JANELA_MESES) as never),
  ]);
  if (bairros.error) throw new Error(`Falha ao ler bairros: ${bairros.error.message}`);
  if (predios.error) throw new Error(`Falha ao listar prédios: ${predios.error.message}`);
  const linhas = predios.data ?? [];
  return { bairros: bairros.data, linhas, total: linhas[0] ? Number(linhas[0].total) : 0 };
}
