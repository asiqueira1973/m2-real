import { describe, expect, it } from "vitest";
import { dispatchWorkflow, parseRotina, WORKFLOW_DA_ROTINA } from "../server/github";
import { generateKey, hashKey, PREFIXO_CHAVE_TAMANHO, validKeyName } from "./chaves";
import { duration } from "./duracao";
import { canConfirm, evidenceSummary, groupByReason, tabFor, type ItemFila } from "./revisao";

describe("chaves de API (6.3; 13.1)", () => {
  it("32 bytes em base64url, hash SHA-256 e prefixo de 8", () => {
    const { chave, hash, prefixo } = generateKey();
    expect(chave).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 caracteres base64url sem padding
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashKey(chave));
    expect(prefixo).toBe(chave.slice(0, PREFIXO_CHAVE_TAMANHO));
    expect(generateKey().chave).not.toBe(chave);
  });
  it("nome de 3 a 60 caracteres", () => {
    expect(validKeyName("  ab ")).toBeNull();
    expect(validKeyName(" abc ")).toBe("abc");
    expect(validKeyName("x".repeat(60))).toHaveLength(60);
    expect(validKeyName("x".repeat(61))).toBeNull();
    expect(validKeyName(42)).toBeNull();
  });
});

describe("disparo do GitHub (13.1)", () => {
  it("cada rotina da 4.4 tem workflow; texto qualquer é recusado", () => {
    expect(Object.keys(WORKFLOW_DA_ROTINA).sort()).toEqual(["calibracao", "coleta-anuncios", "coleta-leiloes", "ingestao-iptu", "ingestao-itbi"]);
    expect(parseRotina("calibracao")).toBe("calibracao");
    expect(parseRotina("vigia")).toBeNull();
    expect(parseRotina({})).toBeNull();
  });
  it("chama workflow_dispatch no main com o token só no cabeçalho", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => { chamadas.push({ url, init }); return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    await dispatchWorkflow("calibracao", { GITHUB_TOKEN_DISPATCH: "tok", GITHUB_REPO: "asiqueira1973/m2-real" }, fetchFalso);
    expect(chamadas[0]!.url).toBe("https://api.github.com/repos/asiqueira1973/m2-real/actions/workflows/calibracao.yml/dispatches");
    expect(JSON.parse(String(chamadas[0]!.init.body))).toEqual({ ref: "main" });
    expect((chamadas[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
  it("sem token → erro claro; GitHub recusou → erro com o status", async () => {
    await expect(dispatchWorkflow("calibracao", {})).rejects.toThrow(/GITHUB_TOKEN_DISPATCH/);
    const recusa = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    await expect(dispatchWorkflow("calibracao", { GITHUB_TOKEN_DISPATCH: "t", GITHUB_REPO: "a/b" }, recusa)).rejects.toThrow(/HTTP 404/);
  });
});

describe("revisão (critérios 1 e 2 do 8.8)", () => {
  it("Confirmar área: desabilitado sem observação ou sem área válida", () => {
    expect(canConfirm("94", "")).toBe(false);
    expect(canConfirm("94", "   ")).toBe(false);
    expect(canConfirm("", "laudo do condomínio")).toBe(false);
    expect(canConfirm("0", "x")).toBe(false);
    expect(canConfirm("94,5", "planta do condomínio")).toBe(true);
  });
  const base: ItemFila = { tipo: "planta", area_iptu: 132, area_privativa: null, fator: null, fator_predio: null, areas_anuncios: null, areas_editais: null, data_venda: null, unidade: null, valor_total: null, m2_privativo: null };
  it("resumo da seção 10: 'planta de 132 m²: anúncios com 94 e 107 m²'", () => {
    expect(evidenceSummary({ ...base, areas_anuncios: [94, 107] })).toBe("planta de 132 m²: anúncios com 94 e 107 m²");
    expect(evidenceSummary({ ...base, areas_editais: [184.32] })).toBe("planta de 132 m²: edital com 184,32 m²");
    expect(evidenceSummary(base)).toBe("planta de 132 m²");
    expect(evidenceSummary({ ...base, tipo: "venda", data_venda: "2025-11-14", unidade: "APTO.11", valor_total: 1630000, m2_privativo: 17158 }))
      .toBe("venda de 14/11/2025 (APTO.11): R$ 1.630.000, R$ 17.158/m²");
  });
  it("agrupa por motivo na ordem recebida e abre a ficha na aba certa", () => {
    const g = groupByReason([{ motivo: "a", total_motivo: 3 }, { motivo: "a", total_motivo: 3 }, { motivo: "b", total_motivo: 1 }]);
    expect(g.map((x) => [x.motivo, x.itens.length, x.total])).toEqual([["a", 2, 3], ["b", 1, 1]]);
    expect(tabFor("venda")).toBe("vendas");
    expect(tabFor("planta")).toBe("plantas");
  });
});

describe("duração das execuções", () => {
  it("segundos, minutos e horas; em andamento = —", () => {
    expect(duration("2026-11-22T10:00:00Z", "2026-11-22T10:00:42Z")).toBe("42 s");
    expect(duration("2026-11-22T10:00:00Z", "2026-11-22T10:03:05Z")).toBe("3 min 05 s");
    expect(duration("2026-11-22T10:00:00Z", "2026-11-22T11:12:00Z")).toBe("1 h 12 min");
    expect(duration("2026-11-22T10:00:00Z", null)).toBe("—");
  });
});

// Verifier do 8.8: revogar com id malformado devolvia 500 (erro do Postgres) em vez de 404; e, com a
// sessão expirada, o proxy redirecionava POST /api/* para /login (o cliente via "Erro 200").
import { isUuid } from "./uuid";
import { unauthenticatedResponse } from "./acesso";

describe("rotas de API", () => {
  it("id de chave precisa ser UUID", () => {
    expect(isUuid("82d8617e-488e-44b3-a94b-c3ac1778c48b")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("82d8617e-488e-44b3-a94b-c3ac1778c48b; drop")).toBe(false);
  });
  it("sem sessão: /api/* recebe 401 em JSON; telas vão para o login", () => {
    expect(unauthenticatedResponse("/api/chaves")).toBe("json-401");
    expect(unauthenticatedResponse("/api/execucoes/disparar")).toBe("json-401");
    expect(unauthenticatedResponse("/painel/predios")).toBe("login");
  });
});
