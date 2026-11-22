/**
 * Dados do site público (épico 8.11): as vendas de 24 meses de cada bairro, a venda mais recente da
 * base e a última conferência do ITBI. Lidos com a credencial de serviço, SÓ NO SERVIDOR (seção 20), e
 * só agregados (nada por pessoa). Falha de leitura não derruba o site: os 10 bairros aparecem sem números.
 */
import { createServiceClient } from "@m2-real/db/server";
import { currentCoverage, latestSaleDate } from "@/server/mcp/dados";
import { BAIRROS_COBERTOS } from "@/server/mcp/sobre";

export type CoberturaSite = { bairro: string; vendas24m: number | null };

/** Data (AAAA-MM-DD) de um instante no fuso de São Paulo. */
export function dataSaoPaulo(instante: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
}

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
    return { cobertura, vendaMaisRecente: data, ultimaConferenciaItbi: itbi.data?.concluida_em ? dataSaoPaulo(itbi.data.concluida_em) : null };
  } catch (e) {
    console.error("site_dados_falhou", (e as Error).message);
    return { cobertura: BAIRROS_COBERTOS.map((bairro) => ({ bairro, vendas24m: null })), vendaMaisRecente: null, ultimaConferenciaItbi: null };
  }
}
