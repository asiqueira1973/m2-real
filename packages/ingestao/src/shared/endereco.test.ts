import { describe, expect, it } from "vitest";
import { normalizeAddress, normalizeText } from "./endereco.js";

// Mesmos casos de supabase/tests/030_funcoes.test.sql: TS e SQL precisam concordar (regra 11.5).
describe("normalizeAddress (regra 11.5, espelho de m2_normalizar_endereco)", () => {
  it.each([
    ["R. Caiubi, 324", "RUA CAIUBI 324"],
    ["  av  Brigadeiro   Faria Lima ", "AVENIDA BRIGADEIRO FARIA LIMA"],
    ["Al. Santos", "ALAMEDA SANTOS"],
    ["Pça. Vilaboim", "PRACA VILABOIM"],
    ["r dr arnaldo", "RUA DOUTOR ARNALDO"],
    ["Rua Prof. Cel. Min. Cap. Sen. Ver. X", "RUA PROFESSOR CORONEL MINISTRO CAPITAO SENADOR VEREADOR X"],
    ["Rua Rui Barbosa", "RUA RUI BARBOSA"],
    ["Higienópolis", "HIGIENOPOLIS"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizeAddress(entrada)).toBe(esperado);
  });

  it("vazio ou nulo vira texto vazio", () => {
    expect(normalizeAddress(null)).toBe("");
    expect(normalizeAddress("   ")).toBe("");
  });
});

describe("normalizeText (regra 11.2: campo bairro normalizado)", () => {
  it("tira acento, passa a maiúsculas e mantém pontuação", () => {
    expect(normalizeText(" Vl.  Pompéia ")).toBe("VL. POMPEIA");
  });
});
