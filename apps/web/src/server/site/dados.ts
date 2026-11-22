/**
 * Dados do site público (épico 8.11): a cobertura atual de cada bairro e a venda mais recente da base.
 * Lidos com a credencial de serviço, SÓ NO SERVIDOR (seção 20), e só agregados (nada por pessoa).
 * Falha de leitura não derruba o site: devolve vazio e a página mostra os bairros sem números.
 */
import { createServiceClient } from "@m2-real/db/server";
import { currentCoverage, latestSaleDate } from "@/server/mcp/dados";

export type CoberturaSite = { bairro: string; vendas24m: number };

export type DadosSite = { cobertura: CoberturaSite[]; vendaMaisRecente: string | null; ultimaConferenciaItbi: string | null };

/**
 * Recebe: nada. Devolve: as vendas de 24 meses por bairro (ordem alfabética), a data da venda mais
 * recente e a data (AAAA-MM-DD) da última conferência concluída do ITBI. A Prefeitura publica as
 * vendas com cerca de um mês de defasagem, por isso as duas datas aparecem juntas no site.
 */
export async function loadSiteData(): Promise<DadosSite> {
  try {
    const db = createServiceClient();
    const [cob, data, itbi] = await Promise.all([
      currentCoverage(db),
      latestSaleDate(db),
      db.from("m2_execucoes_ingestao").select("concluida_em").eq("rotina", "ingestao-itbi").eq("status", "concluida").order("concluida_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (itbi.error) throw new Error(itbi.error.message);
    const cobertura = cob
      .map((c) => ({ bairro: c.bairro_nome, vendas24m: c.vendas_24m }))
      .sort((a, b) => a.bairro.localeCompare(b.bairro, "pt-BR"));
    return { cobertura, vendaMaisRecente: data, ultimaConferenciaItbi: itbi.data?.concluida_em?.slice(0, 10) ?? null };
  } catch (e) {
    console.error("site_dados_falhou", (e as Error).message);
    return { cobertura: [], vendaMaisRecente: null, ultimaConferenciaItbi: null };
  }
}
