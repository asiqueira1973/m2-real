import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Guia } from "../itbi/guias.js";
import { consolidarVendas, marcarForaDaCurva, type GuiaCompraVenda, type VendaConsolidada } from "./consolidar.js";

// Fixture T1 real (seção 22), convertida para guias ligadas a unidades do IPTU.
const { guias: t1 } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "itbi-t1-2025.json"), "utf8")) as { guias: Guia[] };

function daFixture(g: Guia): GuiaCompraVenda {
  const apto = g.usoIptuGuia?.startsWith("APARTAMENTO") ?? false;
  return {
    id: `${g.sql}-${g.dataTransacao}`,
    predioId: g.logradouro.includes("CAIUBI") ? "caiubi-324" : "joaquim-577",
    unidadeId: g.sql,
    bairroId: g.logradouro.includes("CAIUBI") ? 1 : 3,
    tipoUnidade: apto ? "apartamento" : "vaga",
    dataTransacao: g.dataTransacao,
    valorDeclarado: g.valorDeclarado,
    valorVenalReferencia: g.valorVenalReferencia,
    matricula: g.matricula,
    unidadeSemCadastroProprio: g.unidadeSemCadastroProprio,
    areaConstruida: g.areaConstruidaGuia ?? 100,
    plantaId: apto ? "planta-1" : null,
    plantaAreaPrivativa: null,
    plantaSelo: "sem_dado",
    plantaVagasInclusas: null,
  };
}

const vendasT1 = consolidarVendas(t1.map(daFixture));
const venda = (complemento: string) => {
  const g = t1.find((x) => x.complemento === complemento)!;
  return vendasT1.find((v) => v.transacaoApartamentoId === `${g.sql}-${g.dataTransacao}`)!;
};

describe("regra 11.15 com a fixture T1 real (critérios do 8.4)", () => {
  it("Joaquim Antunes, 577, APTO.11, 14/11/2025: total 1.630.000, vagas 240.000, 1 vaga", () => {
    expect(venda("APTO.11")).toMatchObject({ dataTransacao: "2025-11-14", valorTotal: 1630000, valorVagas: 240000, qtdVagasSeparadas: 1 });
  });

  it.each([
    ["APTO 72", 1256081.09, 43918.91, 1300000],
    ["APTO 14", 1130000, 100000, 1230000],
  ])("%s: apartamento %d + vaga %d = %d (tabela T1)", (c, apto, vaga, total) => {
    expect(venda(c)).toMatchObject({ valorApartamento: apto, valorVagas: vaga, valorTotal: total, qtdVagasSeparadas: 1 });
  });

  it("Caiubi, 324, AP 24, 29/08/2025: total 762.600, sem vaga separada", () => {
    expect(venda("AP 24")).toMatchObject({ dataTransacao: "2025-08-29", valorTotal: 762600, qtdVagasSeparadas: 0, valorVagas: 0 });
  });

  it("4 vendas (3 da Joaquim + 1 da Caiubi); as 3 vagas da T1 entram, cada uma numa venda só", () => {
    expect(vendasT1).toHaveLength(4);
    const vagas = vendasT1.flatMap((v) => v.transacoesVagasIds);
    expect(vagas).toHaveLength(3);
    expect(new Set(vagas).size).toBe(3);
  });

  it("m² IPTU = valor do apartamento ÷ área construída; sem área privativa → m² privativo nulo e selo sem_dado", () => {
    expect(venda("APTO.11")).toMatchObject({ m2Iptu: Math.round((1390000 / 132) * 100) / 100, m2Privativo: null, seloArea: "sem_dado" });
  });
});

// Guias sintéticas para os casos de borda da 11.15.
function guia(p: Partial<GuiaCompraVenda> & Pick<GuiaCompraVenda, "id" | "tipoUnidade">): GuiaCompraVenda {
  return {
    predioId: "p1", unidadeId: `u-${p.id}`, bairroId: 1, dataTransacao: "2025-05-10", valorDeclarado: 100,
    valorVenalReferencia: null, matricula: null, unidadeSemCadastroProprio: false, areaConstruida: 100,
    plantaId: "pl", plantaAreaPrivativa: null, plantaSelo: "sem_dado", plantaVagasInclusas: null, ...p,
  };
}

describe("regra 11.15: casos de borda", () => {
  it("2 apartamentos e 3 vagas no mesmo dia: cada vaga vai para a matrícula mais próxima", () => {
    const vs = consolidarVendas([
      guia({ id: "a1", tipoUnidade: "apartamento", matricula: "1000" }),
      guia({ id: "a2", tipoUnidade: "apartamento", matricula: "2000" }),
      guia({ id: "v1", tipoUnidade: "vaga", matricula: "1001" }),
      guia({ id: "v2", tipoUnidade: "vaga", matricula: "2001" }),
      guia({ id: "v3", tipoUnidade: "vaga", matricula: "1002" }),
    ]);
    const de = (id: string) => vs.find((v) => v.transacaoApartamentoId === id)!.transacoesVagasIds.sort();
    expect(de("a1")).toEqual(["v1", "v3"]);
    expect(de("a2")).toEqual(["v2"]);
  });

  it("no máximo 3 vagas por venda; a 4ª fica fora", () => {
    const vs = consolidarVendas([
      guia({ id: "a1", tipoUnidade: "apartamento" }),
      ...["v1", "v2", "v3", "v4"].map((id) => guia({ id, tipoUnidade: "vaga" })),
    ]);
    expect(vs[0]!.qtdVagasSeparadas).toBe(3);
  });

  it("vaga sem apartamento no mesmo prédio e dia fica fora; outro dia ou outro prédio não junta", () => {
    const vs = consolidarVendas([
      guia({ id: "a1", tipoUnidade: "apartamento" }),
      guia({ id: "v-outro-dia", tipoUnidade: "vaga", dataTransacao: "2025-05-11" }),
      guia({ id: "v-outro-predio", tipoUnidade: "vaga", predioId: "p2" }),
    ]);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.qtdVagasSeparadas).toBe(0);
  });

  it("regra 11.14: guia sem cadastro próprio não gera venda nem é agregada como vaga", () => {
    const vs = consolidarVendas([
      guia({ id: "a-lote", tipoUnidade: "apartamento", unidadeSemCadastroProprio: true }),
      guia({ id: "a1", tipoUnidade: "apartamento" }),
      guia({ id: "v-lote", tipoUnidade: "vaga", unidadeSemCadastroProprio: true }),
    ]);
    expect(vs.map((v) => v.transacaoApartamentoId)).toEqual(["a1"]);
    expect(vs[0]!.qtdVagasSeparadas).toBe(0);
  });
});

describe("regra 11.16: fora da curva", () => {
  const v = (id: string, data: string, m2: number | null, p: Partial<VendaConsolidada> = {}): VendaConsolidada => ({
    transacaoApartamentoId: id, transacoesVagasIds: [], predioId: "p1", unidadeId: id, plantaId: "pl", bairroId: 1,
    dataTransacao: data, valorApartamento: 1_000_000, valorVenalReferencia: null, valorVagas: 0, valorTotal: 1_000_000,
    qtdVagasSeparadas: 0, vagasInclusasArea: null, areaPrivativa: m2 ? 100 : null, seloArea: "calibrada",
    m2Privativo: m2, m2Iptu: 5000, foraDaCurva: false, ...p,
  });
  const fora = (vs: VendaConsolidada[]) => Object.fromEntries(marcarForaDaCurva(vs).map((x) => [x.transacaoApartamentoId, x.foraDaCurva]));

  it("valor declarado < 0,5 × valor venal → fora, mesmo sem m²", () => {
    expect(fora([v("x", "2025-01-01", null, { valorApartamento: 400_000, valorVenalReferencia: 900_000 })])).toEqual({ x: true });
    expect(fora([v("y", "2025-01-01", null, { valorApartamento: 500_000, valorVenalReferencia: 900_000 })])).toEqual({ y: false });
  });

  it("prédio com ≥ 3 vendas na janela: fora se < 0,6× ou > 1,6× a mediana do prédio", () => {
    const r = fora([v("a", "2025-01-01", 10_000), v("b", "2025-02-01", 10_500), v("c", "2025-03-01", 9_800), v("baixa", "2025-04-01", 5_000), v("alta", "2025-05-01", 17_000)]);
    expect(r).toMatchObject({ a: false, b: false, c: false, baixa: true, alta: true });
  });

  it("janela de 36 meses que termina na data da venda: vendas antigas não entram", () => {
    // 3 vendas de 2019 a 5.000/m² ficam fora da janela de uma venda de 2025 a 10.000/m²
    const r = fora([v("v19a", "2019-01-01", 5_000), v("v19b", "2019-02-01", 5_000), v("v19c", "2019-03-01", 5_000), v("hoje", "2025-06-01", 10_000)]);
    expect(r.hoje).toBe(false);
  });

  it("prédio com < 3 vendas: usa a mediana do bairro no mesmo selo", () => {
    const bairro = ["b1", "b2", "b3", "b4"].map((id, i) => v(id, `2025-0${i + 1}-01`, 10_000, { predioId: `outro-${id}` }));
    const r = fora([...bairro, v("unica", "2025-06-01", 20_000, { predioId: "p9" }), v("outro-selo", "2025-06-01", 20_000, { predioId: "p8", seloArea: "estimada" })]);
    expect(r.unica).toBe(true); // 20.000 > 1,6 × 10.000
    expect(r["outro-selo"]).toBe(false); // selo diferente: só ela mesma na referência
  });

  it("regra 11.11: venda marcada pelo admin mantém o valor dele", () => {
    const vs = [v("a", "2025-01-01", 10_000), v("b", "2025-02-01", 10_000), v("c", "2025-03-01", 10_000), v("d", "2025-04-01", 50_000)];
    const r = marcarForaDaCurva(vs, new Map([["d", false], ["a", true]]));
    expect(r.find((x) => x.transacaoApartamentoId === "d")!.foraDaCurva).toBe(false);
    expect(r.find((x) => x.transacaoApartamentoId === "a")!.foraDaCurva).toBe(true);
  });
});
