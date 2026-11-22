/**
 * Dados do site público (épico 8.11): a cobertura atual de cada bairro e a venda mais recente da base.
 * Lidos com a credencial de serviço, SÓ NO SERVIDOR (seção 20), e só agregados (nada por pessoa).
 * Falha de leitura não derruba o site: devolve vazio e a página mostra os bairros sem números.
 */
import { createServiceClient } from "@m2-real/db/server";
import { currentCoverage, latestSaleDate } from "@/server/mcp/dados";

export type CoberturaSite = { bairro: string; vendas24m: number; pct: number };

/** Recebe: nada. Devolve: a cobertura por bairro (ordem alfabética) e a data da venda mais recente. */
export async function loadSiteData(): Promise<{ cobertura: CoberturaSite[]; vendaMaisRecente: string | null }> {
  try {
    const db = createServiceClient();
    const [cob, data] = await Promise.all([currentCoverage(db), latestSaleDate(db)]);
    const cobertura = cob
      .map((c) => ({ bairro: c.bairro_nome, vendas24m: c.vendas_24m, pct: Number(c.pct_cobertura) }))
      .sort((a, b) => a.bairro.localeCompare(b.bairro, "pt-BR"));
    return { cobertura, vendaMaisRecente: data };
  } catch (e) {
    console.error("site_dados_falhou", (e as Error).message);
    return { cobertura: [], vendaMaisRecente: null };
  }
}
