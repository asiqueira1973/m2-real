import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Não persistência (critério do 8.5.1): toda escrita em disco passa por espiões. Os módulos de
// leiloes/ importam fs por estes caminhos; nenhum deles pode ser chamado durante a coleta.
const escritas = vi.hoisted(() => [] as string[]);
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const espiar = <F extends (...a: never[]) => unknown>(nome: string, f: F) => ((...a: Parameters<F>) => { escritas.push(nome); return f(...a); }) as F;
  return { ...fs, default: fs, writeFileSync: espiar("writeFileSync", fs.writeFileSync), writeFile: espiar("writeFile", fs.writeFile),
    appendFileSync: espiar("appendFileSync", fs.appendFileSync), createWriteStream: espiar("createWriteStream", fs.createWriteStream) };
});
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  const espiar = <F extends (...a: never[]) => unknown>(nome: string, f: F) => ((...a: Parameters<F>) => { escritas.push(nome); return f(...a); }) as F;
  return { ...fs, default: fs, writeFile: espiar("promises.writeFile", fs.writeFile), appendFile: espiar("promises.appendFile", fs.appendFile) };
});

import { createFirecrawl } from "../anuncios/firecrawl.js";
import { textToPdf } from "../shared/pdfTexto.js";
import { pickAuctionTargets } from "./alvos.js";
import { casarEdital, unitKey } from "./casamento.js";
import { CAMPOS_EDITAL, fromDocument, fromLotPage } from "./extracao.js";
import { downloadPdf, readDocument, type LeitorClaude } from "./pdf.js";
import { auctionQuery, buildEditalRow, COLUNAS_EDITAL, runAuctionCollection, saveEdital } from "./rotina.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");
const CANARIO = JSON.parse(readFileSync(join(FIXTURES, "edital-canario-906-extraido.json"), "utf8")) as Record<string, unknown>;

// Colunas de m2_editais_leilao (7.2). Nenhuma coluna guarda dado de pessoa.
const COLUNAS_TABELA = [
  "id", "url", "url_documento", "dominio", "execucao_id", "logradouro_extraido", "numero_extraido", "complemento_extraido",
  "matricula", "cartorio", "area_privativa", "area_comum", "area_total", "fracao_ideal", "vagas", "vagas_vinculadas_area",
  "valor_avaliacao", "data_leilao", "origem_documento", "predio_id", "unidade_id", "status_casamento", "casado_manual",
  "coletado_em", "criado_em", "atualizado_em",
];

// Dados de pessoa fictícios, como os que aparecem em laudos e editais (só neste teste).
const PESSOA = {
  nome_devedor: "Fulano de Tal Ficticio",
  cpf: "123.456.789-00",
  cnpj: "12.345.678/0001-90",
  estado_civil: "casado",
  proprietario: "Beltrana Ficticia",
  endereco_devedor: "Rua Inventada, 1, apto 2",
  executado: "Sicrano Ficticio",
};
const VAZAMENTO = /Fulano|Beltrana|Sicrano|123\.456|12\.345\.678|casado\b|Rua Inventada/;

/** Cliente falso da Claude API: devolve `saida` como parsed_output e conta as chamadas. */
function claudeFalso(saida: unknown) {
  const chamadas: unknown[] = [];
  const cliente = { messages: { parse: async (corpo: unknown) => { chamadas.push(corpo); return { stop_reason: "end_turn", parsed_output: saida }; } } } as unknown as LeitorClaude;
  return { cliente, chamadas };
}

const ARGS_CASAMENTO = { status: "sem_predio" as const, predioId: null, unidadeId: null };
const AGORA = new Date("2026-11-22T12:00:00Z");

describe("regra 11.19: alvos", () => {
  const p = (id: string, prioridade: number, ultima: string | null = null, confirmada = false) =>
    ({ id, prioridade, ultimaColetaLeilaoEm: ultima, temPlantaConfirmada: confirmada });

  it("(a) guias de leilão primeiro (mais recente antes), depois (b) por prioridade, sem repetir", () => {
    const predios = [p("a1", 0), p("a2", 5), p("b1", 50), p("b2", 10), p("c", 99, null, true)];
    const arrematacoes = new Map([["a1", "2025-01-10"], ["a2", "2026-03-01"]]);
    expect(pickAuctionTargets(predios, arrematacoes, AGORA)).toEqual(["a2", "a1", "b1", "b2"]);
  });

  it("(b) exclui prédio com planta confirmada; (a) não", () => {
    const predios = [p("x", 10, null, true), p("y", 5)];
    expect(pickAuctionTargets(predios, new Map(), AGORA)).toEqual(["y"]);
    expect(pickAuctionTargets(predios, new Map([["x", "2026-01-01"]]), AGORA)).toEqual(["x", "y"]);
  });

  it("não busca de novo antes de 180 dias", () => {
    const predios = [p("recente", 50, "2026-09-01T00:00:00Z"), p("antigo", 40, "2026-04-01T00:00:00Z")];
    expect(pickAuctionTargets(predios, new Map([["recente", "2026-10-01"]]), AGORA)).toEqual(["antigo"]);
  });

  it("(b) para nos 100 de maior prioridade; o teto de alvos corta o total", () => {
    const muitos = Array.from({ length: 150 }, (_, i) => p(`p${String(i).padStart(3, "0")}`, 150 - i));
    expect(pickAuctionTargets(muitos, new Map(), AGORA)).toHaveLength(100);
    expect(pickAuctionTargets(muitos, new Map(), AGORA, 7)).toEqual(["p000", "p001", "p002", "p003", "p004", "p005", "p006"]);
  });
});

describe("regra 11.20: casamento", () => {
  it.each([
    ["APTO 52", "AP 52"], ["AP 52", "AP 52"], ["APARTAMENTO Nº 52", "AP 52"], ["Apartamento 52, 5º andar, Edifício Oxford Park", "AP 52"],
    ["AP 51C", "AP 51C"], ["apto 51-C", "AP 51C"], ["AP 65 E VG", "AP 65"], ["875 APTO 41", "AP 41"], ["AP 12 BL B", "AP 12 BL B"],
    ["Apartamento 7, Torre 2", "AP 7 BL 2"], ["BOX 05", null], [null, null],
  ])("complemento %s → %s", (c, k) => expect(unitKey(c)).toBe(k));

  const unidades = [{ id: "u52", complemento: "AP 52" }, { id: "u61", complemento: "APTO 61 E VG" }];
  const guias = [{ unidadeId: "u61", matricula: "13667" }];

  it("sem prédio → sem_predio", () => expect(casarEdital({ matricula: "1", complemento_extraido: "AP 52" }, null, unidades, guias).status).toBe("sem_predio"));
  it("(1) matrícula igual à de uma guia do ITBI de uma unidade do prédio → casado_unidade (vence o complemento)", () =>
    expect(casarEdital({ matricula: "13667", complemento_extraido: "APARTAMENTO 52" }, "p", unidades, guias))
      .toEqual({ status: "casado_unidade", predioId: "p", unidadeId: "u61" }));
  it("(2) complemento normalizado igual → casado_unidade", () =>
    expect(casarEdital({ matricula: "999", complemento_extraido: "Apartamento nº 52" }, "p", unidades, guias))
      .toEqual({ status: "casado_unidade", predioId: "p", unidadeId: "u52" }));
  it("(3) nada bate → casado_predio", () =>
    expect(casarEdital({ matricula: null, complemento_extraido: "AP 99" }, "p", unidades, guias).status).toBe("casado_predio"));
  it("guia de unidade de outro prédio não conta", () =>
    expect(casarEdital({ matricula: "777", complemento_extraido: null }, "p", unidades, [{ unidadeId: "u-outro", matricula: "777" }]).status).toBe("casado_predio"));
  it("mesmo número em dois blocos e edital sem bloco → casado_predio; com bloco → a unidade", () => {
    const blocos = [{ id: "ua", complemento: "AP 12 BL A" }, { id: "ub", complemento: "AP 12 BL B" }];
    expect(casarEdital({ matricula: null, complemento_extraido: "Apto 12" }, "p", blocos, []).status).toBe("casado_predio");
    expect(casarEdital({ matricula: null, complemento_extraido: "Apto 12, Bloco B" }, "p", blocos, []).unidadeId).toBe("ub");
  });
});

describe("Canário, 906, apto 52 (critério do 8.5.1)", () => {
  it("resposta filtrada da sonda: área privativa 184,32 m² e 2 vagas", async () => {
    const { cliente } = claudeFalso(CANARIO);
    const e = await readDocument(cliente, textToPdf("laudo"), "memoria://canario-906");
    expect(e).toMatchObject({ area_privativa: 184.32, vagas: 2, matricula: "13667", numero_extraido: 906, origem_documento: "laudo" });
  });

  // Teste vivo (opcional; gasta Claude API): RUN_LIVE=1 npx vitest run src/leiloes.
  // O laudo em PDF não é mais publicado; a página do lote 1243 da Franklin Leilões cita o trecho
  // do laudo. O trecho vira PDF só em memória e passa pelo mesmo caminho da coleta.
  it.runIf(process.env.RUN_LIVE === "1")("vivo: trecho público do laudo → PDF em memória → Claude API", async () => {
    const env = join(import.meta.dirname, "..", "..", "..", "..", ".env.local");
    if (!process.env.ANTHROPIC_API_KEY && existsSync(env)) process.loadEnvFile(env);
    const html = await (await fetch("https://www.franklinleiloes.com.br/lote/apto-18432m_-4-dorm-e-2-vagas-indianopolis/1243/", { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const entidades: Record<string, string> = { "&ccedil;": "ç", "&atilde;": "ã", "&oacute;": "ó", "&iacute;": "í", "&aacute;": "á", "&eacute;": "é", "&ordm;": "º" };
    const texto = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, (x) => entidades[x] ?? " ").replace(/\s+/g, " ");
    const inicio = texto.indexOf("APARTAMENTO Nº 52");
    expect(inicio).toBeGreaterThanOrEqual(0);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const e = await readDocument(new Anthropic(), textToPdf(texto.slice(inicio, inicio + 1600)), "memoria://canario-906");
    expect(e).toMatchObject({ area_privativa: 184.32, vagas: 2 });
    const linha = buildEditalRow("https://www.franklinleiloes.com.br/lote/1243", "franklinleiloes.com.br", "e1", e!, ARGS_CASAMENTO, AGORA);
    expect(Object.keys(linha).sort()).toEqual([...COLUNAS_EDITAL].sort());
  }, 120_000);
});

describe("nenhum dado de pessoa chega ao insert (critério do 8.5.1; seção 20)", () => {
  it("chaves do objeto do insert: só colunas de m2_editais_leilao", () => {
    const e = fromDocument({ ...CANARIO, ...PESSOA }, "https://x.com/laudo.pdf")!;
    const linha = buildEditalRow("https://x.com/lote/1", "x.com", "e1", e, ARGS_CASAMENTO, AGORA);
    expect(Object.keys(linha).sort()).toEqual([...COLUNAS_EDITAL].sort());
    for (const k of Object.keys(linha)) expect(COLUNAS_TABELA).toContain(k);
    expect(JSON.stringify(linha)).not.toMatch(VAZAMENTO);
  });

  it("PDF de exemplo com dados de pessoa: a resposta da API passa pelo filtro de campos", async () => {
    const pdf = textToPdf(
      "LAUDO DE AVALIACAO\nExecutado: Fulano de Tal Ficticio, casado, CPF 123.456.789-00, residente na Rua Inventada, 1, apto 2.\n" +
        "Imovel: apartamento 52 da Rua Exemplo, 10. Area privativa 70,50 m2, area total 110,00 m2, 1 vaga. Matricula 4.321 do 1o CRI.",
    );
    // A API, por hipótese, devolve campos a mais com dados da pessoa: o filtro os tira.
    const { cliente, chamadas } = claudeFalso({ ...CANARIO, area_privativa_m2: 70.5, area_total_m2: 110, vagas: 1, matricula: "4.321", ...PESSOA });
    const e = await readDocument(cliente, pdf, "https://x.com/laudo.pdf");
    expect(chamadas).toHaveLength(1);
    expect(Object.keys(e!).sort()).toEqual([...CAMPOS_EDITAL].sort());
    expect(e).toMatchObject({ area_privativa: 70.5, matricula: "4321" });
    expect(JSON.stringify(e)).not.toMatch(VAZAMENTO);
  });

  it("página do lote com campos a mais: também filtrada", () => {
    const r = fromLotPage({ tipo_pagina: "edital_leilao", logradouro: "Rua X", numero: 1, area_privativa_m2: "70,5", links_documentos: ["/a.pdf"], ...PESSOA })!;
    expect(JSON.stringify(r)).not.toMatch(VAZAMENTO);
    expect(r.edital.area_privativa).toBe(70.5);
  });

  it("documento 'outro' ou sem área não grava (13.4)", () => {
    expect(fromDocument({ ...CANARIO, origem_documento: "outro" }, "u")).toBeNull();
    expect(fromDocument({ ...CANARIO, area_privativa_m2: null, area_comum_m2: null, area_total_m2: null }, "u")).toBeNull();
  });
});

describe("download do PDF em memória", () => {
  const resp = (corpo: Buffer | string, cabecalhos: Record<string, string> = {}, status = 200) =>
    (async () => new Response(corpo, { status, headers: cabecalhos })) as unknown as typeof fetch;
  it("devolve o Buffer de um PDF", async () => {
    const pdf = textToPdf("x");
    expect((await downloadPdf("https://x.com/a.pdf", resp(pdf))).equals(pdf)).toBe(true);
  });
  it("recusa o que não é PDF, erro HTTP e arquivo grande demais", async () => {
    await expect(downloadPdf("https://x.com/a.pdf", resp("<html>"))).rejects.toThrow(/não é PDF/);
    await expect(downloadPdf("https://x.com/a.pdf", resp("", {}, 404))).rejects.toThrow(/404/);
    await expect(downloadPdf("https://x.com/a.pdf", resp("%PDF", { "content-length": String(64 * 1024 * 1024) }))).rejects.toThrow(/limite/);
  });
});

/**
 * Banco falso para a rotina: cada tabela devolve as linhas dadas; registra inserts, upserts,
 * updates e qualquer acesso ao Storage.
 */
function bancoFalso(tabelas: Record<string, unknown[]>, rpc: unknown[] = []) {
  const registro = { execucao: null as Record<string, unknown> | null, concluida: null as Record<string, unknown> | null, upserts: [] as Record<string, unknown>[], updates: [] as [string, Record<string, unknown>][], storage: 0 };
  const consulta = (t: string) => {
    const q: Record<string, unknown> = {};
    const encadear = () => q;
    const fim = { data: tabelas[t] ?? [], error: null };
    Object.assign(q, {
      select: encadear, eq: encadear, like: encadear, gte: encadear, not: encadear, order: encadear, limit: encadear, lt: encadear,
      range: async () => fim,
      maybeSingle: async () => ({ data: (tabelas[t] ?? [])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => void) => ok(fim),
      insert: (linha: Record<string, unknown>) => { registro.execucao = linha; return { select: () => ({ single: async () => ({ data: { id: "e1" }, error: null }) }) }; },
      upsert: (linha: Record<string, unknown>) => { registro.upserts.push(linha); return Promise.resolve({ data: null, error: null }); },
      update: (linha: Record<string, unknown>) => {
        if (t === "m2_execucoes_ingestao" && linha.status === "concluida") registro.concluida = linha;
        registro.updates.push([t, linha]);
        const ok = { data: [], error: null };
        return { eq: () => ({ lt: () => ({ select: async () => ok }), then: (r: (v: unknown) => void) => r(ok) }) };
      },
    });
    return q;
  };
  const db = {
    from: consulta,
    rpc: async () => ({ data: rpc, error: null }),
    get storage() { registro.storage++; return { from: () => ({}) }; },
  } as unknown as Parameters<typeof runAuctionCollection>[0];
  return { db, registro };
}

/** Firecrawl falso: busca devolve `urls`; o scrape devolve `pagina`. Conta chamadas. */
function firecrawlFalso(urls: string[], pagina: unknown, maxCreditos = 100) {
  const chamadas = { buscas: [] as string[], scrapes: 0 };
  const fc = createFirecrawl({
    apiKey: "k", maxCreditos, esperar: async () => {},
    fetch: async (url, init) => {
      if (String(url).endsWith("/search")) {
        chamadas.buscas.push(JSON.parse(String(init?.body)).query);
        return new Response(JSON.stringify({ creditsUsed: 2, data: { web: urls.map((u) => ({ url: u })) } }));
      }
      chamadas.scrapes++;
      return new Response(JSON.stringify({ data: { json: pagina, metadata: { creditsUsed: 5 } } }));
    },
  });
  return { fc, chamadas };
}

const PREDIO = { id: "p1", logradouro: "RUA CANARIO", numero: 906, prioridade_coleta: 10, ultima_coleta_leilao_em: null, chave_predio: "041-115-01-1" };
const PAGINA_SEM_AREA = { tipo_pagina: "edital_leilao", logradouro: "Rua Canário", numero: 906, complemento: "Apto 52", links_documentos: ["/docs/laudo.pdf"], ...PESSOA };

describe("coleta-leiloes: rotina", () => {
  it("o espião de escrita em disco funciona (controle do teste de não persistência)", async () => {
    const { writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    escritas.length = 0;
    const arq = join(tmpdir(), `m2-controle-${process.pid}.txt`);
    writeFileSync(arq, "x");
    rmSync(arq);
    expect(escritas).toEqual(["writeFileSync"]);
  });

  it("PDF lido só em memória: nada é escrito em disco nem no Storage; a linha gravada só tem colunas permitidas", async () => {
    escritas.length = 0;
    const { db, registro } = bancoFalso({ m2_predios: [PREDIO], m2_unidades: [{ id: "u52", complemento: "AP 52" }], m2_transacoes: [] }, [{ predio_id: "p1", similaridade: 1 }]);
    const { fc } = firecrawlFalso(["https://www.portalzuk.com.br/lote/1"], PAGINA_SEM_AREA);
    const { cliente, chamadas } = claudeFalso({ ...CANARIO, ...PESSOA });
    const baixados: string[] = [];
    await runAuctionCollection(db, {
      firecrawlApiKey: "k", firecrawl: fc, claude: cliente, predio: "041-115-01-1", agora: () => AGORA,
      baixarPdf: async (u) => { baixados.push(u); return textToPdf("laudo de exemplo"); },
    });
    expect(baixados).toEqual(["https://www.portalzuk.com.br/docs/laudo.pdf"]);
    expect(chamadas).toHaveLength(1);
    expect(escritas).toEqual([]);
    expect(registro.storage).toBe(0);
    expect(registro.upserts).toHaveLength(1);
    const linha = registro.upserts[0]!;
    expect(Object.keys(linha).sort()).toEqual([...COLUNAS_EDITAL].sort());
    expect(JSON.stringify(linha)).not.toMatch(VAZAMENTO);
    expect(linha).toMatchObject({ area_privativa: 184.32, vagas: 2, origem_documento: "laudo", url_documento: "https://www.portalzuk.com.br/docs/laudo.pdf",
      predio_id: "p1", unidade_id: "u52", status_casamento: "casado_unidade" });
  });

  it("execução registrada com rotina coleta-leiloes e fonte edital_leilao; ultima_coleta_leilao_em atualizado", async () => {
    const { db, registro } = bancoFalso({ m2_predios: [PREDIO] });
    const { fc } = firecrawlFalso([], null);
    await runAuctionCollection(db, { firecrawlApiKey: "k", firecrawl: fc, claude: claudeFalso(null).cliente, predio: "041-115-01-1", agora: () => AGORA });
    expect(registro.execucao).toEqual({ rotina: "coleta-leiloes", fonte: "edital_leilao", referencia: null });
    expect(registro.concluida).toMatchObject({ status: "concluida" });
    expect(registro.updates).toContainEqual(["m2_predios", { ultima_coleta_leilao_em: AGORA.toISOString() }]);
  });

  it("matrícula do edital igual à de uma guia do ITBI da unidade → casado_unidade (critério)", async () => {
    const { db, registro } = bancoFalso(
      { m2_predios: [PREDIO], m2_unidades: [{ id: "u52", complemento: "AP 52" }, { id: "u61", complemento: "AP 61" }], m2_transacoes: [{ unidade_id: "u61", matricula: "13667" }] },
      [{ predio_id: "p1", similaridade: 1 }],
    );
    const { fc } = firecrawlFalso(["https://www.portalzuk.com.br/lote/1"], { ...PAGINA_SEM_AREA, complemento: null });
    await runAuctionCollection(db, { firecrawlApiKey: "k", firecrawl: fc, claude: claudeFalso({ ...CANARIO, complemento: null }).cliente, predio: "041-115-01-1",
      agora: () => AGORA, baixarPdf: async () => textToPdf("x") });
    expect(registro.upserts[0]).toMatchObject({ matricula: "13667", unidade_id: "u61", status_casamento: "casado_unidade" });
  });

  it("LEILAO_MAX_ALVOS_EXECUCAO: com 3 alvos e teto 2, só 2 são buscados (critério)", async () => {
    const predios = ["a", "b", "c"].map((id, i) => ({ ...PREDIO, id, prioridade_coleta: 10 - i }));
    const { db } = bancoFalso({ m2_predios: predios, m2_transacoes: [], m2_plantas: [] });
    const { fc, chamadas } = firecrawlFalso([], null);
    await runAuctionCollection(db, { firecrawlApiKey: "k", firecrawl: fc, claude: claudeFalso(null).cliente, maxAlvos: 2, agora: () => AGORA });
    expect(chamadas.buscas).toHaveLength(2);
  });

  it("CLAUDE_MAX_DOCUMENTOS_EXECUCAO: com 3 PDFs e teto 2, só 2 vão à API (critério)", async () => {
    const { db } = bancoFalso({ m2_predios: [PREDIO] });
    const urls = [1, 2, 3].map((n) => `https://www.portalzuk.com.br/lote/${n}`);
    const { fc } = firecrawlFalso(urls, PAGINA_SEM_AREA);
    const { cliente, chamadas } = claudeFalso({ ...CANARIO, area_privativa_m2: null }); // sem área privativa: continuaria lendo
    await runAuctionCollection(db, { firecrawlApiKey: "k", firecrawl: fc, claude: cliente, maxDocumentos: 2, predio: "041-115-01-1",
      agora: () => AGORA, baixarPdf: async () => textToPdf("x") });
    expect(chamadas).toHaveLength(2);
  });

  it("PDF de domínio fora da allowlist não é baixado; resultado fora da allowlist não é raspado", async () => {
    const { db } = bancoFalso({ m2_predios: [PREDIO] });
    const { fc, chamadas } = firecrawlFalso(["https://www.outro-site.com.br/lote/1", "https://www.portalzuk.com.br/lote/2"],
      { ...PAGINA_SEM_AREA, links_documentos: ["https://golpe.com/laudo.pdf"] });
    const baixados: string[] = [];
    await runAuctionCollection(db, { firecrawlApiKey: "k", firecrawl: fc, claude: claudeFalso(CANARIO).cliente, predio: "041-115-01-1",
      agora: () => AGORA, baixarPdf: async (u) => { baixados.push(u); return textToPdf("x"); } });
    expect(chamadas.scrapes).toBe(1);
    expect(baixados).toEqual([]);
  });

  it("a busca usa a allowlist de leilão", () => {
    expect(auctionQuery({ id: "p", logradouro: "RUA CANARIO", numero: 906 }, ["portalzuk.com.br", "megaleiloes.com.br"]))
      .toBe('"Canario, 906" leilão São Paulo (site:portalzuk.com.br OR site:megaleiloes.com.br)');
  });
});

describe("saveEdital: regra 11.11", () => {
  const linha = { url: "https://www.portalzuk.com.br/lote/1", area_privativa: 99 } as never;
  function db(leitura: { data: unknown; error: unknown }) {
    const gravacoes: unknown[] = [];
    const cliente = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => leitura }) }),
        upsert: (l: unknown) => { gravacoes.push(l); return Promise.resolve({ data: null, error: null }); },
      }),
    } as unknown as Parameters<typeof saveEdital>[0];
    return { cliente, gravacoes };
  }
  it("edital casado à mão não é alterado", async () => {
    const { cliente, gravacoes } = db({ data: { casado_manual: true }, error: null });
    expect(await saveEdital(cliente, linha)).toBe("mantido_manual");
    expect(gravacoes).toHaveLength(0);
  });
  it("edital novo é gravado", async () => {
    const { cliente, gravacoes } = db({ data: null, error: null });
    expect(await saveEdital(cliente, linha)).toBe("gravado");
    expect(gravacoes).toHaveLength(1);
  });
  it("erro ao ler casado_manual não grava", async () => {
    const { cliente, gravacoes } = db({ data: null, error: { message: "permission denied" } });
    await expect(saveEdital(cliente, linha, { esperasMs: [] })).rejects.toThrow(/permission denied/);
    expect(gravacoes).toHaveLength(0);
  });
});

// Bug da 1ª rodada real (22/11/2026, Zuk, Alameda Ministro Rocha Azevedo, 988): a página listava
// dois lotes (apartamento com 482,92 m² úteis e vaga com 31,52 m² de área total) e a extração
// misturou os dois: área privativa 482,92 com área total 31,52. Área total menor que a privativa
// é impossível na mesma unidade; o valor não pode ser gravado.
describe("área total menor que a privativa (lotes misturados na página)", () => {
  it("página do lote: área total impossível vira nula, a privativa fica", () => {
    const r = fromLotPage({ tipo_pagina: "edital_leilao", logradouro: "Alameda Ministro Rocha Azevedo", numero: 988, area_privativa_m2: 482.92, area_total_m2: 31.52 })!;
    expect(r.edital).toMatchObject({ area_privativa: 482.92, area_total: null });
  });
  it("documento: idem", () => {
    expect(fromDocument({ ...CANARIO, area_privativa_m2: 184.32, area_total_m2: 31.52 }, "u")).toMatchObject({ area_privativa: 184.32, area_total: null });
  });
});
