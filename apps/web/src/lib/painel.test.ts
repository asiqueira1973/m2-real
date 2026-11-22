import { describe, expect, it } from "vitest";
import { accessDecision, isPublicPath, MENSAGENS } from "./acesso";
import { parsePeriod, salesSummary } from "./estatistica";
import { pageHref, parsePrediosFilters, toRpcArgs, TAMANHO_PAGINA } from "./filtros";
import { area, data, fator, numero, percentual, reais, reaisPorM2 } from "./formato";
import { confirmedSource, parseSelo, ROTULO_SELO, SELOS } from "./selos";

describe("formatos brasileiros (seção 16)", () => {
  it("os exemplos do spec: R$ 1.630.000; 94 m²; R$ 17.340/m²", () => {
    expect(reais(1_630_000)).toBe("R$ 1.630.000");
    expect(area(94)).toBe("94 m²");
    expect(reaisPorM2(17_340.4)).toBe("R$ 17.340/m²");
  });
  it("decimais, fator, percentual, milhar, data e nulos", () => {
    expect(area(94.5)).toBe("94,5 m²");
    expect(fator(0.72)).toBe("0,720");
    expect(percentual(33.3)).toBe("33,3%");
    expect(numero(53_161)).toBe("53.161");
    expect(data("2025-11-14")).toBe("14/11/2025");
    expect(reais(null)).toBe("—");
    expect(area(undefined)).toBe("—");
  });
});

describe("selos (seções 15 e 16)", () => {
  it("rótulos da seção 15 e ordem do pior para o melhor", () => {
    expect(SELOS.map((s) => ROTULO_SELO[s])).toEqual(["Sem dado", "Estimada", "Indicativa", "Calibrada", "Confirmada"]);
  });
  it("Confirmada mostra a fonte: revisão ou edital", () => {
    expect(confirmedSource("confirmada", "revisao_manual")).toBe("revisão");
    expect(confirmedSource("confirmada", "edital_leilao")).toBe("edital");
    expect(confirmedSource("calibrada", "edital_leilao")).toBeNull();
  });
  it("filtro aceita só os 5 selos", () => {
    expect(parseSelo("calibrada")).toBe("calibrada");
    expect(parseSelo("drop table")).toBeNull();
  });
});

describe("acesso ao painel (seção 6.1)", () => {
  it("sem sessão → login; sem perfil, perfil inativo ou outro papel → sem-perfil; admin ativo → entra", () => {
    expect(accessDecision(false, null)).toBe("login");
    expect(accessDecision(true, null)).toBe("sem-perfil");
    expect(accessDecision(true, { papel: "admin", ativo: false })).toBe("sem-perfil");
    expect(accessDecision(true, { papel: "outro", ativo: true })).toBe("sem-perfil");
    expect(accessDecision(true, { papel: "admin", ativo: true })).toBe("entrar");
  });
  it("mensagem da seção 15", () => expect(MENSAGENS.semPerfil).toBe("Acesso não autorizado. Fale com o administrador do Fechou por Quanto."));
  it("rotas públicas: só login, recuperação e os retornos de auth", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirmar")).toBe(true);
    expect(isPublicPath("/predios")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("filtros da tela Prédios (URL → RPC)", () => {
  it("valores válidos viram filtros e argumentos do RPC, com paginação", () => {
    const f = parsePrediosFilters({ bairro: "3", selo: "calibrada", revisao: "1", busca: "  Joaquim Antunes, 577 ", pagina: "3" });
    expect(f).toEqual({ bairro: 3, selo: "calibrada", soRevisao: true, busca: "Joaquim Antunes, 577", pagina: 3 });
    expect(toRpcArgs(f, 24)).toEqual({ bairro: 3, selo: "calibrada", so_revisao: true, busca: "Joaquim Antunes, 577", janela_meses: 24, limite: TAMANHO_PAGINA, deslocamento: 2 * TAMANHO_PAGINA });
  });
  it("valores inválidos viram 'sem filtro'; busca vazia vira nulo", () => {
    const f = parsePrediosFilters({ bairro: "abc", selo: "x", pagina: "-2", busca: "   " });
    expect(f).toEqual({ bairro: null, selo: null, soRevisao: false, busca: "", pagina: 1 });
    expect(toRpcArgs(f, 24).busca).toBeNull();
  });
  it("link de página mantém os filtros", () => {
    const f = parsePrediosFilters({ bairro: "3", revisao: "1" });
    expect(pageHref(f, 2)).toBe("/predios?bairro=3&revisao=1&pagina=2");
    expect(pageHref(parsePrediosFilters({}), 1)).toBe("/predios");
  });
});

describe("resumo das vendas da ficha", () => {
  it("mediana sem as fora da curva e sem as sem área; n total separado", () => {
    const r = salesSummary([
      { m2_privativo: 10_000, fora_da_curva: false }, { m2_privativo: 12_000, fora_da_curva: false },
      { m2_privativo: 50_000, fora_da_curva: true }, { m2_privativo: null, fora_da_curva: false },
    ]);
    expect(r).toEqual({ total: 4, naMediana: 2, mediana: 11_000 });
    expect(salesSummary([]).mediana).toBeNull();
  });
  it("período: padrão 24; 'todas' = sem limite; inválido = padrão", () => {
    expect(parsePeriod(undefined, 24)).toBe(24);
    expect(parsePeriod("todas", 24)).toBeNull();
    expect(parsePeriod("60", 24)).toBe(60);
    expect(parsePeriod("999", 24)).toBe(24);
  });
});

// Bug do teste no navegador (22/11/2026): com o banco fora do ar, a leitura do perfil falhou,
// o layout entendeu "sem perfil" e DESCONECTOU o admin com "Acesso não autorizado". Falha de
// leitura não é ausência de perfil: tem de virar erro (estado de erro da tela), sem sair.
describe("acesso: falha ao ler o perfil não desconecta", () => {
  it("erro na leitura do perfil → 'erro', não 'sem-perfil'", () => {
    expect(accessDecision(true, null, { message: "fetch failed" })).toBe("erro");
  });
  it("sem erro e sem perfil continua 'sem-perfil'", () => {
    expect(accessDecision(true, null, null)).toBe("sem-perfil");
  });
});
