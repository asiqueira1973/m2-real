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
import { runAdsCollection } from "./rotina.js";

describe("coleta: contagem da execução quando o teto para a rodada no meio do prédio", () => {
  it("página não raspada por causa do teto não conta como lida", async () => {
    let resultado: { linhasLidas: number; linhasGravadas: number; linhasDescartadas: number } | null = null;
    const tabela = () => {
      const q: Record<string, unknown> = {};
      const encadear = () => q;
      Object.assign(q, {
        select: encadear, eq: encadear, ilike: encadear, not: encadear, limit: encadear, order: encadear, update: encadear, upsert: encadear, lt: encadear,
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: "e1" }, error: null }) }) }),
        maybeSingle: async () => ({ data: { id: "p1", logradouro: "RUA X", numero: 1, bairro: { nome: "Pinheiros" }, casado_manual: false }, error: null }),
        single: async () => ({ data: { fator_predio: null }, error: null }),
        then: (ok: (v: unknown) => void) => ok({ data: [], error: null }),
      });
      return q;
    };
    const db = {
      from: (t: string) => {
        const q = tabela();
        if (t === "m2_execucoes_ingestao") {
          (q as { update: unknown }).update = (linha: Record<string, unknown>) => {
            if (linha.status === "concluida") resultado = { linhasLidas: linha.linhas_lidas as number, linhasGravadas: linha.linhas_gravadas as number, linhasDescartadas: linha.linhas_descartadas as number };
            const fim = { data: [], error: null };
            const eq = () => ({ lt: () => ({ select: async () => fim }), then: (ok: (v: unknown) => void) => ok(fim) });
            return { eq };
          };
        }
        return q;
      },
      rpc: async () => ({ data: [], error: null }),
    } as unknown as Parameters<typeof runAdsCollection>[0];
    // Teto de 12: busca (2) + 2 scrapes (10) cabem; o 3º scrape não.
    const fc = createFirecrawl({
      apiKey: "k", maxCreditos: 12, esperar: async () => {},
      fetch: async (url) => new Response(JSON.stringify(String(url).endsWith("/search")
        ? { creditsUsed: 2, data: { web: ["a", "b", "c"].map((x) => ({ url: `https://www.lopes.com.br/${x}` })) } }
        : { data: { json: LOPES_MONDRIAN, metadata: { creditsUsed: 5 } } }), { status: 200 }),
    });
    await runAdsCollection(db, { apiKey: "k", firecrawl: fc, predio: "001-001-01-1" });
    expect(resultado).toEqual({ linhasLidas: 2, linhasGravadas: 2, linhasDescartadas: 0 });
  });
});
