import { describe, expect, it } from "vitest";
import { casarAnuncio } from "./casamento.js";
import { allowedDomain, siteFilter } from "./dominios.js";
import { toAnuncio, type AnuncioExtraido } from "./extracao.js";
import { createFirecrawl, ErroFirecrawl, TetoDeCreditos } from "./firecrawl.js";
import { collectionPriority, pickBuildings } from "./prioridade.js";
import { buildAnuncioRow, COLUNAS_ANUNCIO, searchQuery } from "./rotina.js";

// Resposta real da extração da página da Lopes do Edifício Mondrian (sonda de 22/11/2026).
const LOPES_MONDRIAN = {
  tipo_pagina: "pagina_condominio", logradouro: "R Joaquim Antunes", numero: 577, nome_condominio: "Condomínio Edifício Mondrian",
  finalidade: "venda", area_privativa_m2: 94, area_privativa_min_m2: 94, area_privativa_max_m2: 100, quartos: 3, vagas: 2, andar: 1, preco: 1490000,
};

// Colunas de m2_anuncios (7.2). Campos de contato, de corretor, de texto livre ou de pessoa NÃO estão aqui.
const COLUNAS_TABELA = [
  "id", "url", "dominio", "fonte", "execucao_id", "logradouro_extraido", "numero_extraido", "nome_condominio", "finalidade",
  "area_privativa", "area_privativa_min", "area_privativa_max", "quartos", "vagas", "andar", "preco_pedido", "predio_id",
  "planta_id", "status_casamento", "confianca_casamento", "casado_manual", "coletado_em", "criado_em", "atualizado_em",
];

describe("allowlist de domínios (critério do 8.5: só domínios da allowlist são acessados)", () => {
  it.each([
    ["https://www.lopes.com.br/condominios/x", "lopes.com.br"],
    ["https://quintoandar.com.br/imovel/1", "quintoandar.com.br"],
    ["https://loft.com.br/condominio/y", "loft.com.br"],
  ])("%s → %s", (url, dominio) => expect(allowedDomain(url)).toBe(dominio));

  it.each([
    "https://www.zapimoveis.com.br/imovel/1",
    "https://lopes.com.br.golpe.com/x",
    "https://notlopes.com.br/x",
    "ftp://lopes.com.br/x",
    "isto não é url",
  ])("%s → recusada", (url) => expect(allowedDomain(url)).toBeNull());

  it("a busca carrega o filtro de sites", () => {
    expect(siteFilter()).toBe("(site:lopes.com.br OR site:quintoandar.com.br OR site:loft.com.br)");
    expect(searchQuery({ id: "p", logradouro: "RUA JOAQUIM ANTUNES", numero: 577, bairro: "Pinheiros" }))
      .toBe('"Joaquim Antunes, 577" Pinheiros São Paulo (site:lopes.com.br OR site:quintoandar.com.br OR site:loft.com.br)');
  });
});

describe("extração e allowlist de campos (critério do 8.5; princípio 4; seção 20)", () => {
  it("página real da Lopes vira anúncio com área 94 e faixa 94–100", () => {
    expect(toAnuncio(LOPES_MONDRIAN)).toMatchObject({ fonte: "pagina_condominio", area_privativa: 94, area_privativa_min: 94, area_privativa_max: 100, numero_extraido: 577 });
  });

  it("campos extras na resposta (contato, corretor, fotos, texto livre) não chegam à linha do insert", () => {
    const sujo = { ...LOPES_MONDRIAN, telefone: "11 99999-0000", email: "a@b.com", corretor: "Fulano", creci: "123", fotos: ["x.jpg"], description: "texto", whatsapp: "x" };
    const linha = buildAnuncioRow("https://www.lopes.com.br/x", "lopes.com.br", "e1", toAnuncio(sujo)!,
      { status: "casado_planta", predioId: "p", plantaId: "pl", confianca: 1 }, new Date("2026-11-22T00:00:00Z"));
    expect(Object.keys(linha).sort()).toEqual([...COLUNAS_ANUNCIO].sort());
    for (const k of Object.keys(linha)) expect(COLUNAS_TABELA).toContain(k);
    expect(JSON.stringify(linha)).not.toMatch(/99999|a@b\.com|Fulano|x\.jpg|texto/);
  });

  it("página 'outro' é descartada; página sem nenhum campo de área não grava (seção 12)", () => {
    expect(toAnuncio({ ...LOPES_MONDRIAN, tipo_pagina: "outro" })).toBeNull();
    expect(toAnuncio({ tipo_pagina: "anuncio", logradouro: "R X", numero: 1, preco: 10 })).toBeNull();
  });

  it("strings 'null' viram nulo; faixa invertida é corrigida", () => {
    expect(toAnuncio({ tipo_pagina: "anuncio", area_privativa_m2: 80, logradouro: "null", finalidade: "undefined" }))
      .toMatchObject({ logradouro_extraido: null, finalidade: null, area_privativa: 80 });
    expect(toAnuncio({ tipo_pagina: "pagina_condominio", area_privativa_min_m2: 120, area_privativa_max_m2: 70 }))
      .toMatchObject({ area_privativa_min: 70, area_privativa_max: 120 });
  });
});

describe("regra 11.8: casamento", () => {
  const a = (p: Partial<AnuncioExtraido>) => ({ fonte: "anuncio" as const, area_privativa: null, area_privativa_min: null, area_privativa_max: null, ...p });
  const predio = { id: "p1", similaridade: 0.83 };
  const duas = [{ id: "pl-pequena", areaIptuReferencia: 100 }, { id: "pl-grande", areaIptuReferencia: 160 }];
  const tres = [...duas, { id: "pl-media", areaIptuReferencia: 108 }];

  it("sem prédio → sem_predio", () => expect(casarAnuncio(a({ area_privativa: 70 }), null, [], null).status).toBe("sem_predio"));
  it("prédio de uma planta só casa direto (Joaquim Antunes, 577)", () =>
    expect(casarAnuncio(a({ area_privativa: 94 }), predio, [{ id: "pl132", areaIptuReferencia: 132 }], null))
      .toEqual({ status: "casado_planta", predioId: "p1", plantaId: "pl132", confianca: 0.83 }));
  it("área ÷ fator a até 12% de uma planta → casado_planta", () =>
    expect(casarAnuncio(a({ area_privativa: 70 }), predio, duas, 0.7)).toMatchObject({ status: "casado_planta", plantaId: "pl-pequena" }));
  it("mais de uma planta a até 12% → ambiguo", () =>
    expect(casarAnuncio(a({ area_privativa: 73 }), predio, tres, 0.7).status).toBe("ambiguo"));
  it("nenhuma planta a até 12% → casado_predio", () =>
    expect(casarAnuncio(a({ area_privativa: 90 }), predio, duas, 0.7).status).toBe("casado_predio"));
  it("sem fator (antes do 8.6) → casado_predio", () =>
    expect(casarAnuncio(a({ area_privativa: 70 }), predio, duas, null).status).toBe("casado_predio"));
  it("página de condomínio com faixa e 2 plantas → casa a menor", () =>
    expect(casarAnuncio(a({ fonte: "pagina_condominio", area_privativa_min: 70, area_privativa_max: 110 }), predio, duas, null))
      .toMatchObject({ status: "casado_planta", plantaId: "pl-pequena" }));
  it("faixa com 3 plantas → casado_predio", () =>
    expect(casarAnuncio(a({ fonte: "pagina_condominio", area_privativa_min: 70, area_privativa_max: 110 }), predio, tres, 0.7).status).toBe("casado_predio"));
});

describe("regra 11.13: prioridade e escolha", () => {
  it("vendas × peso do pior selo", () => {
    expect(collectionPriority(10, ["calibrada", "sem_dado"])).toBe(40);
    expect(collectionPriority(10, ["estimada", "calibrada"])).toBe(30);
    expect(collectionPriority(10, ["indicativa"])).toBe(20);
    expect(collectionPriority(10, ["calibrada", "confirmada"])).toBe(0);
  });
  it("só prioridade > 0, coleta nula ou com mais de 90 dias, da maior para a menor", () => {
    const agora = new Date("2026-11-22T00:00:00Z");
    const ids = pickBuildings([
      { id: "a", prioridade: 10, ultimaColetaEm: null },
      { id: "b", prioridade: 50, ultimaColetaEm: "2026-11-01T00:00:00Z" }, // coletado há 21 dias
      { id: "c", prioridade: 30, ultimaColetaEm: "2026-07-01T00:00:00Z" }, // há mais de 90 dias
      { id: "d", prioridade: 0, ultimaColetaEm: null },
    ], agora, 150);
    expect(ids).toEqual(["c", "a"]);
  });
});

describe("cliente do Firecrawl: teto de créditos e tentativas (seções 12 e 17)", () => {
  const ok = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200 });

  it("para antes de passar do teto", async () => {
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 6, fetch: async () => ok({ creditsUsed: 2, data: { web: [] } }), esperar: async () => {} });
    await fc.buscar("q", 5);
    await fc.buscar("q", 5);
    await fc.buscar("q", 5);
    await expect(fc.buscar("q", 5)).rejects.toBeInstanceOf(TetoDeCreditos);
    expect(fc.creditosUsados()).toBe(6);
  });

  it("429 repete com esperas de 10, 30 e 90 s e depois desiste (prédio pulado)", async () => {
    const esperas: number[] = [];
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 600, fetch: async () => new Response("", { status: 429 }), esperar: async (ms) => { esperas.push(ms); } });
    await expect(fc.extrair("https://lopes.com.br/x", {}, "p")).rejects.toBeInstanceOf(ErroFirecrawl);
    expect(esperas).toEqual([10_000, 30_000, 90_000]);
  });

  it("503 seguido de sucesso devolve a extração e conta os créditos reais", async () => {
    let n = 0;
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 600, esperar: async () => {},
      fetch: async () => (++n === 1 ? new Response("", { status: 503 }) : ok({ data: { json: LOPES_MONDRIAN, metadata: { creditsUsed: 5 } } })) });
    expect(await fc.extrair("https://lopes.com.br/x", {}, "p")).toEqual(LOPES_MONDRIAN);
    expect(fc.creditosUsados()).toBe(5);
  });

  it("400 não repete", async () => {
    let n = 0;
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 600, esperar: async () => {}, fetch: async () => { n++; return new Response("", { status: 400 }); } });
    await expect(fc.buscar("q", 5)).rejects.toBeInstanceOf(ErroFirecrawl);
    expect(n).toBe(1);
  });
});

// Bug da 1ª rodada real com teto (22/11/2026): "11 páginas raspadas, 10 gravadas, 0 descartadas".
// A página era contada antes do scrape; quando o teto parava a rodada naquela chamada, ficava
// contada sem ter sido raspada. Raspada = scrape feito: lidas = gravadas + descartadas depois do scrape.
import { AnthropicError, APIError } from "@anthropic-ai/sdk";
import { ANUNCIO_MARKDOWN_MAX_CARACTERES } from "../config/regras.js";
import { lerAnuncio, trimMarkdown, type LeitorClaude } from "./leitor.js";
import { runAdsCollection } from "./rotina.js";

// Épico 8.15 (mudança de especificação declarada no plano): o scrape pede só o markdown (1 crédito)
// e a extração da 13.3 é do Claude. O teste do teto foi refeito para esse caminho.
const fakeDb = (aoConcluir: (r: { linhasLidas: number; linhasGravadas: number; linhasDescartadas: number }) => void, atualizados: string[] = []) => {
  const tabela = (t: string) => {
    const q: Record<string, unknown> = {};
    const encadear = () => q;
    Object.assign(q, {
      select: encadear, eq: encadear, gte: encadear, in: encadear, ilike: encadear, not: encadear, limit: encadear, order: encadear, upsert: encadear, lt: encadear,
      update: (linha: Record<string, unknown>) => { if (t === "m2_predios" && "ultima_coleta_em" in linha) atualizados.push(t); return q; },
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "e1" }, error: null }) }) }),
      maybeSingle: async () => ({ data: { id: "p1", logradouro: "RUA X", numero: 1, bairro: { nome: "Pinheiros" }, casado_manual: false }, error: null }),
      single: async () => ({ data: { fator_predio: null }, error: null }),
      then: (ok: (v: unknown) => void) => ok({ data: [], error: null }),
    });
    return q;
  };
  return {
    from: (t: string) => {
      const q = tabela(t);
      if (t === "m2_execucoes_ingestao") {
        (q as { update: unknown }).update = (linha: Record<string, unknown>) => {
          if (linha.status === "concluida") aoConcluir({ linhasLidas: linha.linhas_lidas as number, linhasGravadas: linha.linhas_gravadas as number, linhasDescartadas: linha.linhas_descartadas as number });
          const fim = { data: [], error: null };
          const eq = () => ({ lt: () => ({ select: async () => fim }), then: (ok: (v: unknown) => void) => ok(fim) });
          return { eq };
        };
      }
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  } as unknown as Parameters<typeof runAdsCollection>[0];
};

/** Firecrawl falso: a busca devolve `urls`; o scrape devolve um markdown e registra o corpo pedido. */
const fakeFirecrawl = (maxCreditos: number, urls: string[], corpos: unknown[] = []) =>
  createFirecrawl({
    apiKey: "k", maxCreditos, esperar: async () => {},
    fetch: async (url, init) => {
      if (String(url).endsWith("/search")) return new Response(JSON.stringify({ creditsUsed: 2, data: { web: urls.map((u) => ({ url: u })) } }), { status: 200 });
      corpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: { markdown: "Condomínio Edifício Mondrian, R Joaquim Antunes 577. Área útil 94 m².", metadata: { creditsUsed: 1 } } }), { status: 200 });
    },
  });

/** Claude falso: cada chamada executa `resposta` (devolve a saída ou lança o erro). */
const fakeClaude = (resposta: () => unknown, chamadas: unknown[] = []) =>
  ({ messages: { parse: async (corpo: unknown) => { chamadas.push(corpo); return resposta(); } } }) as unknown as LeitorClaude;
const saidaMondrian = () => ({ stop_reason: "end_turn", parsed_output: LOPES_MONDRIAN });
const LOPES = ["a", "b", "c"].map((x) => `https://www.lopes.com.br/${x}`);

describe("coleta: contagem da execução quando o teto para a rodada no meio do prédio", () => {
  it("página não raspada por causa do teto não conta como lida", async () => {
    let resultado: unknown = null;
    // Teto de 4: busca (2) + 2 scrapes de markdown (2) cabem; o 3º scrape não.
    const fc = fakeFirecrawl(4, LOPES);
    await runAdsCollection(fakeDb((r) => (resultado = r)), { apiKey: "k", firecrawl: fc, claude: fakeClaude(saidaMondrian), predio: "001-001-01-1" });
    expect(resultado).toEqual({ linhasLidas: 2, linhasGravadas: 2, linhasDescartadas: 0 });
    expect(fc.creditosUsados()).toBe(4);
  });
});

describe("épico 8.15: scrape só em markdown e extração pelo Claude", () => {
  it("o scrape pede só markdown e conteúdo principal; cada página custa 1 crédito", async () => {
    const corpos: Record<string, unknown>[] = [];
    const fc = fakeFirecrawl(100, LOPES, corpos);
    const chamadas: Record<string, unknown>[] = [];
    let resultado: unknown = null;
    await runAdsCollection(fakeDb((r) => (resultado = r)), { apiKey: "k", firecrawl: fc, claude: fakeClaude(saidaMondrian, chamadas), predio: "001-001-01-1" });
    expect(corpos).toHaveLength(3);
    for (const c of corpos) expect(c).toEqual({ url: expect.any(String), formats: ["markdown"], onlyMainContent: true });
    expect(fc.creditosUsados()).toBe(2 + 3); // busca + 3 páginas
    expect(chamadas).toHaveLength(3);
    expect(chamadas[0]).toMatchObject({ model: "claude-haiku-4-5" });
    expect(resultado).toEqual({ linhasLidas: 3, linhasGravadas: 3, linhasDescartadas: 0 });
  });

  it("teto de páginas do Claude (CLAUDE_MAX_DOCUMENTOS_EXECUCAO): para sem raspar a página seguinte e sem marcar o prédio", async () => {
    const corpos: unknown[] = [];
    const atualizados: string[] = [];
    let resultado: unknown = null;
    await runAdsCollection(fakeDb((r) => (resultado = r), atualizados), {
      apiKey: "k", firecrawl: fakeFirecrawl(100, LOPES, corpos), claude: fakeClaude(saidaMondrian), maxDocumentos: 2, predio: "001-001-01-1",
    });
    expect(corpos).toHaveLength(2);
    expect(atualizados).toEqual([]);
    expect(resultado).toEqual({ linhasLidas: 2, linhasGravadas: 2, linhasDescartadas: 0 });
  });

  it("erro permanente da Claude API (400) descarta só a página; o prédio é concluído", async () => {
    let n = 0;
    const atualizados: string[] = [];
    let resultado: unknown = null;
    const claude = fakeClaude(() => { if (++n === 1) throw new APIError(400, { type: "error" }, "invalid_request", new Headers()); return saidaMondrian(); });
    await runAdsCollection(fakeDb((r) => (resultado = r), atualizados), { apiKey: "k", firecrawl: fakeFirecrawl(100, LOPES), claude, predio: "001-001-01-1" });
    expect(resultado).toEqual({ linhasLidas: 3, linhasGravadas: 2, linhasDescartadas: 1 });
    expect(atualizados).toEqual(["m2_predios"]);
  });

  it("saída estruturada inválida (erro do SDK sem status) descarta só a página, sem travar o prédio", async () => {
    let n = 0;
    const atualizados: string[] = [];
    let resultado: unknown = null;
    const claude = fakeClaude(() => { if (++n === 1) throw new AnthropicError("Failed to parse structured output"); return saidaMondrian(); });
    await runAdsCollection(fakeDb((r) => (resultado = r), atualizados), { apiKey: "k", firecrawl: fakeFirecrawl(100, LOPES), claude, predio: "001-001-01-1" });
    expect(resultado).toEqual({ linhasLidas: 3, linhasGravadas: 2, linhasDescartadas: 1 });
    expect(atualizados).toEqual(["m2_predios"]);
  });

  it("no teto de páginas, o prédio seguinte nem faz a busca (não gasta créditos)", async () => {
    const urls: string[] = [];
    const fc = createFirecrawl({
      apiKey: "k", maxCreditos: 100, esperar: async () => {},
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/search")) return new Response(JSON.stringify({ creditsUsed: 2, data: { web: LOPES.slice(0, 2).map((u) => ({ url: u })) } }), { status: 200 });
        return new Response(JSON.stringify({ data: { markdown: "Área útil 94 m²", metadata: { creditsUsed: 1 } } }), { status: 200 });
      },
    });
    // Dois prédios-alvo pela prioridade (11.13): com o teto de 2 páginas, o primeiro esgota o teto e o segundo não busca.
    const base = fakeDb(() => {});
    const dados: Record<string, unknown[]> = {
      m2_vendas_consolidadas: [{ id: "v1", predio_id: "p1" }, { id: "v2", predio_id: "p2" }],
      m2_plantas: [],
      m2_predios: ["p1", "p2"].map((id) => ({ id, logradouro: "RUA X", numero: 1, ultima_coleta_em: null, bairro: { nome: "Pinheiros" } })),
    };
    const db = {
      ...base,
      from: (t: string) => {
        const q = base.from(t as never) as unknown as Record<string, unknown>;
        if (t in dados) q.range = async () => ({ data: dados[t], error: null });
        return q;
      },
    } as unknown as Parameters<typeof runAdsCollection>[0];
    await runAdsCollection(db, { apiKey: "k", firecrawl: fc, claude: fakeClaude(saidaMondrian), maxDocumentos: 2 });
    expect(urls.filter((u) => u.endsWith("/search"))).toHaveLength(1);
    expect(fc.creditosUsados()).toBe(4);
  });

  it("erro transitório da Claude API (529) pula o prédio sem marcar ultima_coleta_em (seção 12)", async () => {
    const atualizados: string[] = [];
    let resultado: unknown = null;
    const claude = fakeClaude(() => { throw new APIError(529, { type: "error" }, "overloaded", new Headers()); });
    await runAdsCollection(fakeDb((r) => (resultado = r), atualizados), { apiKey: "k", firecrawl: fakeFirecrawl(100, LOPES), claude, predio: "001-001-01-1" });
    expect(atualizados).toEqual([]);
    expect(resultado).toEqual({ linhasLidas: 1, linhasGravadas: 0, linhasDescartadas: 0 });
  });
});

describe("lerAnuncio (épico 8.15; 13.3)", () => {
  it("saída válida passa pela allowlist: chaves extras somem", async () => {
    const claude = fakeClaude(() => ({ stop_reason: "end_turn", parsed_output: { ...LOPES_MONDRIAN, corretor: "x", telefone: "1" } }));
    const a = await lerAnuncio(claude, "texto");
    expect(a).toEqual(toAnuncio(LOPES_MONDRIAN));
    expect(Object.keys(a!)).not.toContain("corretor");
  });
  it("recusa, saída vazia e markdown vazio → nulo (sem chamar o Claude no vazio)", async () => {
    expect(await lerAnuncio(fakeClaude(() => ({ stop_reason: "refusal", parsed_output: null })), "texto")).toBeNull();
    expect(await lerAnuncio(fakeClaude(() => ({ stop_reason: "end_turn", parsed_output: null })), "texto")).toBeNull();
    const chamadas: unknown[] = [];
    expect(await lerAnuncio(fakeClaude(saidaMondrian, chamadas), "   ")).toBeNull();
    expect(chamadas).toHaveLength(0);
  });
  it("markdown é cortado em ANUNCIO_MARKDOWN_MAX_CARACTERES", async () => {
    const chamadas: { messages: { content: { text: string }[] }[] }[] = [];
    await lerAnuncio(fakeClaude(saidaMondrian, chamadas as unknown[]), "x".repeat(ANUNCIO_MARKDOWN_MAX_CARACTERES + 500));
    const texto = chamadas[0]!.messages[0]!.content[0]!.text;
    expect(texto.match(/x/g)).toHaveLength(ANUNCIO_MARKDOWN_MAX_CARACTERES);
    expect(trimMarkdown("curto")).toBe("curto");
  });
  it("erro da API sobe para a rotina decidir", async () => {
    await expect(lerAnuncio(fakeClaude(() => { throw new Error("rede"); }), "texto")).rejects.toThrow("rede");
  });
});

describe("lerMarkdown no cliente do Firecrawl", () => {
  it("custo previsto de 1 crédito respeita o teto", async () => {
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 1, esperar: async () => {}, fetch: async () => new Response(JSON.stringify({ data: { markdown: "m" } }), { status: 200 }) });
    expect(await fc.lerMarkdown("https://lopes.com.br/x")).toBe("m");
    expect(fc.creditosUsados()).toBe(1);
    await expect(fc.lerMarkdown("https://lopes.com.br/y")).rejects.toBeInstanceOf(TetoDeCreditos);
  });
  it("429 repete com as esperas e depois desiste; resposta sem markdown → texto vazio", async () => {
    const esperas: number[] = [];
    const fc = createFirecrawl({ apiKey: "k", maxCreditos: 100, fetch: async () => new Response("", { status: 429 }), esperar: async (ms) => { esperas.push(ms); } });
    await expect(fc.lerMarkdown("https://lopes.com.br/x")).rejects.toBeInstanceOf(ErroFirecrawl);
    expect(esperas).toEqual([10_000, 30_000, 90_000]);
    const vazio = createFirecrawl({ apiKey: "k", maxCreditos: 100, esperar: async () => {}, fetch: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }) });
    expect(await vazio.lerMarkdown("https://lopes.com.br/x")).toBe("");
  });
});

// Regra 11.11 (apontado pelo verifier do 8.5): o pipeline NUNCA altera anúncio com
// casado_manual = true — nem vínculo nem campos extraídos. E se a leitura de casado_manual
// falhar, a gravação não pode seguir às cegas (sobrescreveria o vínculo do admin).
import { saveAd } from "./rotina.js";

describe("saveAd: regra 11.11", () => {
  const linha = { url: "https://www.lopes.com.br/x", area_privativa: 99, predio_id: "p", planta_id: "pl", status_casamento: "casado_planta" } as never;
  function db(leitura: { data: unknown; error: unknown }) {
    const gravacoes: unknown[] = [];
    const cliente = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => leitura }) }),
        upsert: (l: unknown) => { gravacoes.push(l); return Promise.resolve({ data: null, error: null }); },
      }),
    } as unknown as Parameters<typeof saveAd>[0];
    return { cliente, gravacoes };
  }

  it("anúncio casado à mão pelo admin não é alterado (nada é gravado)", async () => {
    const { cliente, gravacoes } = db({ data: { casado_manual: true }, error: null });
    expect(await saveAd(cliente, linha)).toBe("mantido_manual");
    expect(gravacoes).toHaveLength(0);
  });

  it("anúncio novo ou não manual é gravado", async () => {
    const { cliente, gravacoes } = db({ data: null, error: null });
    expect(await saveAd(cliente, linha)).toBe("gravado");
    expect(gravacoes).toHaveLength(1);
  });

  it("erro ao ler casado_manual não grava (falha em vez de sobrescrever o vínculo do admin)", async () => {
    const { cliente, gravacoes } = db({ data: null, error: { message: "permission denied" } });
    await expect(saveAd(cliente, linha, { esperasMs: [] })).rejects.toThrow(/permission denied/);
    expect(gravacoes).toHaveLength(0);
  });
});

// Seção 13.3: "área total × útil" verificado com uma página de exemplo salva (fixtures/).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkTotalArea } from "./extracao.js";

describe("13.3: área total nunca vira área privativa (página de exemplo salva)", () => {
  const pagina = readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "anuncio-area-total-e-util.md"), "utf8");
  const base = toAnuncio({ tipo_pagina: "anuncio", logradouro: "Rua Joaquim Antunes", numero: 577, finalidade: "venda", area_privativa_m2: 87, preco: 1350000 })!;

  it("extração certa (área útil 87) passa intacta", () => {
    expect(checkTotalArea(base, pagina)?.area_privativa).toBe(87);
  });
  it("extração que pegou a área total (132) é corrigida para a útil (87)", () => {
    expect(checkTotalArea({ ...base, area_privativa: 132 }, pagina)?.area_privativa).toBe(87);
  });
  it("página só com área total: a área extraída é descartada e, sem outra área, o anúncio não grava", () => {
    const soTotal = "- Área total: 132 m²\n- 3 quartos";
    expect(checkTotalArea({ ...base, area_privativa: 132 }, soTotal)).toBeNull();
  });
  it("página com faixa e área total: perde a área única mas mantém a faixa", () => {
    const r = checkTotalArea({ ...base, area_privativa: 132, area_privativa_min: 80, area_privativa_max: 95 }, "Área total 132 m²");
    expect(r).toMatchObject({ area_privativa: null, area_privativa_min: 80, area_privativa_max: 95 });
  });
  it("página sem 'área total' não é tocada (ex.: página real da Lopes do Mondrian)", () => {
    expect(checkTotalArea(toAnuncio(LOPES_MONDRIAN), "Área privativa 94 a 100 m²")?.area_privativa).toBe(94);
  });
});

describe("épico 8.15: fixtures reais no caminho markdown → Claude → checagem da 13.3", () => {
  const fixture = (nome: string) => readFileSync(join(import.meta.dirname, "..", "..", "fixtures", nome), "utf8");

  it("Lopes do Mondrian (Joaquim Antunes, 577): o texto enviado ao Claude mantém endereço e área, sem sintaxe de imagem nem URLs (a extração em si foi validada com o Claude real no plano 8.15)", async () => {
    const pagina = fixture("anuncio-lopes-mondrian.md");
    const enviado = trimMarkdown(pagina);
    expect(enviado).toContain("R Joaquim Antunes, 577");
    expect(enviado).toContain("94m²");
    expect(enviado).toContain("em R Joaquim Antunes, no bairro");
    expect(enviado).not.toMatch(/https?:|!\[/);
    const a = checkTotalArea(await lerAnuncio(fakeClaude(saidaMondrian), pagina), pagina);
    expect(a).toMatchObject({ area_privativa: 94, numero_extraido: 577 });
  });

  it("se o Claude pegar a área total (132), a checagem da 13.3 troca pela útil (87)", async () => {
    const pagina = fixture("anuncio-area-total-e-util.md");
    const claude = fakeClaude(() => ({ stop_reason: "end_turn", parsed_output: { ...LOPES_MONDRIAN, tipo_pagina: "anuncio", area_privativa_m2: 132, area_privativa_min_m2: null, area_privativa_max_m2: null } }));
    expect(checkTotalArea(await lerAnuncio(claude, pagina), pagina)?.area_privativa).toBe(87);
  });
});
