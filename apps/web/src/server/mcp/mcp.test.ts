import { describe, expect, it } from "vitest";
import { bearerFrom, MENSAGEM_CHAVE_INVALIDA, unauthorized, verifyKey } from "./auth";
import { decade, m2WithoutSeal, medianSummary, pickComparables, type Candidata, type VendaMcp } from "./calculos";
import { ESQUEMAS, FONTE, MENSAGENS_MCP, resetHealthCache, runTool } from "./ferramentas";

const venda = (p: Partial<VendaMcp> = {}): VendaMcp => ({
  data: "2025-06-01", unidade: "AP 1", valor_total: 1_000_000, valor_apartamento: 1_000_000, valor_vagas: 0, area_privativa: 100,
  selo_area: "calibrada", m2_privativo: 10_000, m2_iptu: 7_000, vagas_inclusas_area: null, fora_da_curva: false, ...p,
});

describe("regra 11.17: mediana", () => {
  it("só selo ≥ estimada, sem fora da curva e com m²; devolve n, distribuição por selo e vagas inclusas", () => {
    const r = medianSummary([
      venda({ m2_privativo: 10_000 }), venda({ m2_privativo: 12_000, selo_area: "estimada", vagas_inclusas_area: 1 }),
      venda({ m2_privativo: 14_000, selo_area: "confirmada" }), venda({ m2_privativo: 99_000, fora_da_curva: true }),
      venda({ m2_privativo: 1_000, selo_area: "sem_dado" }), venda({ m2_privativo: null }),
    ]);
    expect(r).toEqual({ mediana_m2_privativo: 12_000, p25: 11_000, p75: 13_000, n_vendas: 3, distribuicao_selos: { calibrada: 1, estimada: 1, confirmada: 1 }, com_vagas_inclusas: 1 });
  });
  it("sem vendas válidas → nulos e n = 0", () => {
    expect(medianSummary([venda({ selo_area: "sem_dado" })])).toMatchObject({ mediana_m2_privativo: null, n_vendas: 0 });
  });
});

describe("13.2: comparaveis", () => {
  const c = (p: Partial<Candidata>): Candidata => ({ ...venda(), predio_id: "outro", logradouro: "RUA X", numero: 1, ano_construcao: 1975, ...p });
  it("área ±20%, década ±1, sem o próprio prédio; mesma rua primeiro, depois mais recentes", () => {
    const r = pickComparables([
      c({ area_privativa: 79, data: "2025-01-01" }), // fora: < 80
      c({ area_privativa: 121, data: "2025-01-02" }), // fora: > 120
      c({ ano_construcao: 1995, data: "2025-01-03" }), // fora: década 1990 vs 1970
      c({ predio_id: "p", data: "2025-01-04" }), // fora: o próprio prédio
      c({ data: "2025-05-01" }), c({ data: "2025-03-01", logradouro: "RUA DO PREDIO" }), c({ ano_construcao: 1968, data: "2025-04-01" }),
    ], 100, 1970, "RUA DO PREDIO", "p", 10);
    expect(r.map((x) => x.data)).toEqual(["2025-03-01", "2025-05-01", "2025-04-01"]);
    expect(pickComparables([c({}), c({}), c({})], 100, 1970, "Y", "p", 2)).toHaveLength(2);
    expect(decade(1979)).toBe(1970);
  });
});

describe("princípio 1: nenhum m² sem selo e área", () => {
  it("acusa m2_privativo sem selo/área e mediana sem distribuição", () => {
    expect(m2WithoutSeal({ vendas: [venda()], mediana: medianSummary([venda()]) })).toEqual([]);
    expect(m2WithoutSeal({ x: { m2_privativo: 1 } })).toEqual(["$.x.m2_privativo"]);
    expect(m2WithoutSeal({ mediana_m2_privativo: 1 })).toEqual(["$.mediana_m2_privativo"]);
  });
});

describe("autenticação (6.3; seção 15)", () => {
  it("Bearer <chave> e mais nada", () => {
    expect(bearerFrom("Bearer abc")).toBe("abc");
    expect(bearerFrom("bearer abc")).toBe("abc");
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });
  it("401 com a mensagem da seção 15", async () => {
    const r = unauthorized();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: MENSAGEM_CHAVE_INVALIDA });
  });
  const db = (linha: unknown) => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linha, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }) as never;
  it("chave ativa passa; revogada ou inexistente não", async () => {
    expect(await verifyKey(db({ id: "k", ativa: true }), "x")).toBe("k");
    expect(await verifyKey(db({ id: "k", ativa: false }), "x")).toBeNull();
    expect(await verifyKey(db(null), "x")).toBeNull();
  });
});

describe("ferramentas (13.2): schemas, mensagens e campos comuns", () => {
  it("schemas: limites da 13.2 e padrões", () => {
    expect(ESQUEMAS.buscar_predio.safeParse({ endereco: "ab" }).success).toBe(false);
    expect(ESQUEMAS.vendas_predio.parse({ predio_id: "82d8617e-488e-44b3-a94b-c3ac1778c48b" }).meses).toBe(36);
    expect(ESQUEMAS.m2_bairro.safeParse({ bairro: "moema" }).success).toBe(false);
    expect(ESQUEMAS.m2_bairro.parse({ bairro: "pinheiros" }).meses).toBe(24);
    expect(ESQUEMAS.comparaveis.safeParse({ predio_id: "82d8617e-488e-44b3-a94b-c3ac1778c48b", limite: 31 }).success).toBe(false);
  });

  /** Banco falso: tabelas e RPC com respostas fixas; aceita qualquer encadeamento do supabase-js. */
  function banco(tabelas: Record<string, unknown[]>, rpc: unknown[] = []) {
    const consulta = (t: string) => {
      const q: Record<string, unknown> = {};
      const fim = { data: tabelas[t] ?? [], error: null };
      for (const m of ["select", "eq", "gte", "lte", "not", "order", "limit", "in"]) q[m] = () => q;
      q.range = async () => fim;
      q.maybeSingle = async () => ({ data: (tabelas[t] ?? [])[0] ?? null, error: null });
      q.then = (ok: (v: unknown) => void) => ok(fim);
      return q;
    };
    return { from: consulta, rpc: async () => ({ data: rpc, error: null }) } as never;
  }
  const execucoes = ["ingestao-itbi", "ingestao-iptu", "coleta-anuncios", "coleta-leiloes", "calibracao"].map((rotina) => ({
    rotina, referencia: null, status: "concluida", iniciada_em: new Date().toISOString(), concluida_em: new Date().toISOString(), linhas_lidas: 1, linhas_gravadas: 1, mensagem_erro: null,
  }));

  it("buscar_predio sem resultado → mensagem 'fora da cobertura'; toda resposta com fonte, atualizado_em e O5", async () => {
    resetHealthCache();
    const r = await runTool(banco({ m2_execucoes_ingestao: execucoes }), "buscar_predio", { endereco: "Rua Inexistente, 1" });
    expect(r).toMatchObject({ predios: [], mensagem: MENSAGENS_MCP.foraDaCobertura, fonte: FONTE, dados_desatualizados: false, motivo_desatualizacao: null });
    expect(r).toHaveProperty("atualizado_em");
  });

  it("dados desatualizados (O5): rotina que falhou aparece na resposta", async () => {
    resetHealthCache();
    const falhou = execucoes.map((e) => (e.rotina === "calibracao" ? { ...e, status: "falhou", mensagem_erro: "timeout" } : e));
    const r = await runTool(banco({ m2_execucoes_ingestao: falhou }), "buscar_predio", { endereco: "Rua X, 1" });
    expect(r.dados_desatualizados).toBe(true);
    expect(String(r.motivo_desatualizacao)).toMatch(/calibracao/);
  });

  it("vendas_predio sem vendas → mensagem da seção 15; com vendas → mediana com selos (princípio 1)", async () => {
    resetHealthCache();
    const vazio = await runTool(banco({ m2_execucoes_ingestao: execucoes }), "vendas_predio", { predio_id: "p", meses: 36 });
    expect(vazio.mensagem).toBe(MENSAGENS_MCP.semVendas);
    const linha = { id: "v", data_transacao: "2025-11-14", valor_total: 1630000, valor_apartamento: 1390000, valor_vagas: 240000, area_privativa: 95, selo_area: "calibrada",
      m2_privativo: 17157.89, m2_iptu: 10530, vagas_inclusas_area: 0, fora_da_curva: false, unidade: { complemento: "APTO.11" } };
    const r = await runTool(banco({ m2_execucoes_ingestao: execucoes, m2_vendas_consolidadas: [linha] }), "vendas_predio", { predio_id: "p", meses: 36 });
    expect(r.vendas).toEqual([expect.objectContaining({ data: "2025-11-14", unidade: "APTO.11", valor_total: 1630000, m2_privativo: 17157.89, selo_area: "calibrada", area_privativa: 95 })]);
    expect(m2WithoutSeal(r)).toEqual([]);
  });
});
