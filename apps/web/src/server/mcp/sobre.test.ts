// Ferramenta `sobre` e instruções do servidor (13.2, acréscimo de 23/11/2026).
import { describe, expect, it } from "vitest";
import { DESCRICOES, ESQUEMAS, FONTE, resetHealthCache, runTool } from "./ferramentas";
import { withSealLabels } from "./rotulos";
import { BAIRROS_COBERTOS, INSTRUCOES_MCP } from "./sobre";

const execucoes = ["ingestao-itbi", "ingestao-iptu", "coleta-anuncios", "coleta-leiloes", "calibracao"].map((rotina) => ({
  rotina, referencia: null, status: "concluida", iniciada_em: new Date().toISOString(), concluida_em: new Date().toISOString(), linhas_lidas: 1, linhas_gravadas: 1, mensagem_erro: null,
}));
const cobertura = [{ bairro_id: 3, bairro_nome: "Pinheiros", calculado_em: "2026-11-22T10:00:00Z", vendas_24m: 2100, pct_cobertura: 0.4 }];

/** Banco falso: execuções para a saúde (O5) e a RPC de cobertura. */
function banco() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "not", "order", "limit", "in"]) q[m] = () => q;
  q.range = async () => ({ data: execucoes, error: null });
  q.maybeSingle = async () => ({ data: { data_transacao: "2026-10-06" }, error: null });
  q.then = (ok: (v: unknown) => void) => ok({ data: execucoes, error: null });
  return { from: () => q, rpc: async () => ({ data: cobertura, error: null }) } as never;
}

describe("ferramenta sobre", () => {
  it("sem entrada; descrição diz para usar em perguntas sobre o serviço", () => {
    expect(ESQUEMAS.sobre.safeParse({}).success).toBe(true);
    expect(DESCRICOES.sobre).toMatch(/próprio serviço/);
  });
  it("explica bairros, fontes, método, os 5 selos e a cobertura atual, com o envelope da 13.2", async () => {
    resetHealthCache();
    const r = await runTool(banco(), "sobre", {});
    expect(r.bairros).toHaveLength(BAIRROS_COBERTOS.length);
    expect(BAIRROS_COBERTOS).toHaveLength(14);
    expect(r.atualizacao).toMatchObject({ venda_mais_recente: "2026-10-06", itbi: "mensal (dia 8)" });
    expect((r.fontes as unknown[]).length).toBe(4);
    expect((r.selos as { selo: string }[]).map((s) => s.selo)).toEqual(["Confirmada", "Calibrada", "Indicativa", "Estimada", "Sem dado"]);
    expect(r.cobertura_atual).toEqual([{ bairro: "Pinheiros", vendas_24m: 2100, pct_cobertura: 0.4, calculado_em: "2026-11-22T10:00:00Z" }]);
    expect(r).toMatchObject({ fonte: FONTE, dados_desatualizados: false });
    // Os rótulos da seção 15 não alteram os nomes já legíveis dos selos.
    expect((withSealLabels(r) as typeof r).selos).toEqual(r.selos);
  });
  it("instruções do servidor citam os 10 bairros e mandam usar sobre e buscar_predio", () => {
    for (const b of BAIRROS_COBERTOS) expect(INSTRUCOES_MCP).toContain(b);
    expect(INSTRUCOES_MCP).toMatch(/`sobre`/);
    expect(INSTRUCOES_MCP).toMatch(/`buscar_predio`/);
    expect(INSTRUCOES_MCP).toMatch(/todo mês/);
    for (const s of ["Confirmada", "Calibrada", "Indicativa", "Estimada", "Sem dado"]) expect(INSTRUCOES_MCP).toContain(s);
  });
});
