/**
 * Cliente do Firecrawl v2 para a coleta (épico 8.5; seções 12 e 17).
 * - Orçamento de créditos por execução (FIRECRAWL_MAX_CREDITOS_EXECUCAO): antes de cada chamada,
 *   se o custo previsto passa do teto, lança TetoDeCreditos (a rodada para e conclui).
 * - 429 ou 5xx: até 3 tentativas com espera de 10, 30 e 90 s; depois, ErroFirecrawl (o prédio é pulado).
 * - robots.txt: o Firecrawl respeita por padrão; nenhuma opção aqui muda isso (seção 20).
 * fetch e a espera são injetáveis para os testes rodarem sem rede.
 */
import { FIRECRAWL_CUSTO_BUSCA, FIRECRAWL_CUSTO_SCRAPE, FIRECRAWL_ESPERAS_S } from "../config/regras.js";

const BASE = "https://api.firecrawl.dev/v2";

/** O teto de créditos da execução foi atingido (seção 17): a rodada para e conclui. */
export class TetoDeCreditos extends Error {}

/** Falha da API depois das tentativas (seção 12): o prédio é pulado sem atualizar ultima_coleta_em. */
export class ErroFirecrawl extends Error {}

export interface FirecrawlDeps {
  apiKey: string;
  maxCreditos: number;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  esperasS?: readonly number[];
}

export interface ResultadoBusca {
  url: string;
  title: string | null;
}

/**
 * Cria o cliente.
 * Recebe: chave, teto de créditos e, nos testes, fetch/espera falsos. Devolve: busca, scrape e o
 * total de créditos usados (somado dos creditsUsed das respostas).
 */
export function createFirecrawl(deps: FirecrawlDeps) {
  const fazerFetch = deps.fetch ?? fetch;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const esperas = deps.esperasS ?? FIRECRAWL_ESPERAS_S;
  let usados = 0;

  /** Chama a API com as tentativas da seção 12. Devolve o JSON da resposta. */
  async function chamar(caminho: string, corpo: unknown, custoPrevisto: number): Promise<Record<string, unknown>> {
    if (usados + custoPrevisto > deps.maxCreditos) {
      throw new TetoDeCreditos(`Teto de ${deps.maxCreditos} créditos atingido (${usados} usados).`);
    }
    for (let tentativa = 0; ; tentativa++) {
      const resp = await fazerFetch(`${BASE}${caminho}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (resp.ok) {
        const json = (await resp.json()) as Record<string, unknown>;
        usados += creditos(json, custoPrevisto);
        return json;
      }
      const repetir = resp.status === 429 || resp.status >= 500;
      if (!repetir || tentativa >= esperas.length) {
        throw new ErroFirecrawl(`Firecrawl ${caminho} respondeu ${resp.status} (após ${tentativa + 1} tentativa(s)).`);
      }
      await esperar(esperas[tentativa]! * 1000);
    }
  }

  return {
    /** Créditos usados até agora nesta execução. */
    creditosUsados: () => usados,

    /**
     * Busca na web (até `limite` resultados). Recebe: texto da busca e limite.
     * Devolve: URLs e títulos (data.web da v2).
     */
    async buscar(query: string, limite: number): Promise<ResultadoBusca[]> {
      const json = await chamar("/search", { query, limit: limite }, FIRECRAWL_CUSTO_BUSCA);
      const web = (json.data as { web?: { url?: string; title?: string }[] } | undefined)?.web ?? [];
      return web.filter((w) => typeof w.url === "string").map((w) => ({ url: w.url!, title: w.title ?? null }));
    },

    /**
     * Raspa uma página com extração JSON (13.3). Recebe: URL, schema e prompt.
     * Devolve: o objeto extraído (data.json), ou nulo se a API não trouxer extração.
     */
    async extrair(url: string, schema: unknown, prompt: string): Promise<unknown> {
      const json = await chamar("/scrape", { url, formats: [{ type: "json", schema, prompt }], onlyMainContent: true }, FIRECRAWL_CUSTO_SCRAPE);
      return (json.data as { json?: unknown } | undefined)?.json ?? null;
    },

    /**
     * Igual a extrair, pedindo também o markdown da página (para a checagem "área total × útil"
     * da 13.3, em extracao.ts). Recebe: URL, schema e prompt. Devolve: { json, markdown }.
     */
    async extrairComTexto(url: string, schema: unknown, prompt: string): Promise<{ json: unknown; markdown: string }> {
      const json = await chamar("/scrape", { url, formats: [{ type: "json", schema, prompt }, "markdown"], onlyMainContent: true }, FIRECRAWL_CUSTO_SCRAPE);
      const data = json.data as { json?: unknown; markdown?: string } | undefined;
      return { json: data?.json ?? null, markdown: data?.markdown ?? "" };
    },
  };
}

/** Créditos cobrados numa resposta (creditsUsed no topo ou em data.metadata); sem o campo, usa o previsto. */
function creditos(json: Record<string, unknown>, previsto: number): number {
  const topo = json.creditsUsed;
  const meta = (json.data as { metadata?: { creditsUsed?: unknown } } | undefined)?.metadata?.creditsUsed;
  const n = typeof topo === "number" ? topo : typeof meta === "number" ? meta : previsto;
  return n;
}

export type Firecrawl = ReturnType<typeof createFirecrawl>;
