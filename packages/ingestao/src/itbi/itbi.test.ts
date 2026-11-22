import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Neighborhood } from "../iptu/montagem.js";
import { assignNeighborhoods, fieldNeighborhood, vote } from "./bairro.js";
import { mapHeader, normalizeHeader } from "./colunas.js";
import { hashRow, isPurchase, isUnitWithoutOwnRecord, sheetMonth, toDate, toGuia, type Guia } from "./guias.js";
import { readItbiWorkbook } from "./leitor.js";
import { extractXlsxLinks, workbookYear } from "./rotina.js";

// Cabeçalho real de 2025 (28 colunas).
const CAB_2025 = [
  "N° do Cadastro (SQL)", "Nome do Logradouro", "Número", "Complemento", "Bairro", "Referência", "CEP",
  "Natureza de Transação", "Valor de Transação (declarado pelo contribuinte)", "Data de Transação",
  "Valor Venal de Referência", "Proporção Transmitida (%)", "Valor Venal de Referência (proporcional)",
  "Base de Cálculo adotada", "Tipo de Financiamento", "Valor Financiado", "Cartório de Registro",
  "Matrícula do Imóvel", "Situação do SQL", "Área do Terreno (m2)", "Testada (m)", "Fração Ideal",
  "Área Construída (m2)", "Uso (IPTU)", "Descrição do uso (IPTU)", "Padrão (IPTU)", "Descrição do padrão (IPTU)", "ACC (IPTU)",
];
// Variante real de 2021/2022: sem "Descrição do padrão" e com "ACC (IPTU)" repetido.
const CAB_2021 = CAB_2025.map((c) => (c === "Descrição do padrão (IPTU)" ? "ACC (IPTU)" : c));

/** Linha de dados no formato da planilha (tipos como o exceljs devolve). */
function linha(p: Partial<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    "N° do Cadastro (SQL)": 1501401564, "Nome do Logradouro": "R JOAQUIM ANTUNES", "Número": 577, "Complemento": "APTO 72",
    "Bairro": "PINHEIROS", "CEP": 5415011, "Natureza de Transação": "1.Compra e venda",
    "Valor de Transação (declarado pelo contribuinte)": 1256081.09, "Data de Transação": new Date(Date.UTC(2025, 6, 15)),
    "Valor Venal de Referência": 900000, "Proporção Transmitida (%)": 100, "Valor Venal de Referência (proporcional)": 900000,
    "Base de Cálculo adotada": 1256081.09, "Tipo de Financiamento": "1.Sistema Financeiro de Habitação", "Valor Financiado": 500000,
    "Cartório de Registro": "10º CARTORIO", "Matrícula do Imóvel": 53678, "Fração Ideal": 0.0158, "Área Construída (m2)": 132,
    "Uso (IPTU)": 20, "Descrição do uso (IPTU)": "APARTAMENTO EM CONDOMÍNIO (EXIGE FRAÇÃO IDEAL)", ...p,
  };
  return CAB_2025.map((c) => base[c] ?? null);
}
const COL = mapHeader(CAB_2025, "JUL-2025");

describe("colunas do ITBI (8.3: leitura pelo nome do cabeçalho)", () => {
  it("normaliza nomes", () => {
    expect(normalizeHeader("N° do Cadastro (SQL)")).toBe("n do cadastro sql");
    expect(normalizeHeader("Área Construída (m2)")).toBe("area construida m2");
  });
  it("acha as colunas em 2025 (28), em 2021 (ACC repetido) e com 'pardão' (FEV-2026)", () => {
    expect(COL.sql).toBe(0);
    expect(mapHeader(CAB_2021, "JAN-2021").usoDescricao).toBe(24);
    expect(mapHeader(CAB_2025.map((c) => c.replace("padrão", "pardão")), "FEV-2026").areaConstruida).toBe(22);
  });
  it("29 colunas (coluna extra no meio) continuam pelo nome, não pela posição", () => {
    const cab29 = [...CAB_2025.slice(0, 5), "Coluna Nova", ...CAB_2025.slice(5)];
    const c = mapHeader(cab29, "X-2023");
    expect(c.cep).toBe(7);
    expect(c.areaConstruida).toBe(23);
  });
  it("falta de coluna obrigatória falha com a lista", () => {
    expect(() => mapHeader(CAB_2025.filter((c) => c !== "CEP"), "JAN-2025")).toThrow(/sem colunas obrigatórias: cep/);
  });
});

describe("guias: conversão e regras puras", () => {
  it("aba mensal → mês de referência; auxiliares → nulo", () => {
    expect(sheetMonth("JAN-2025")).toBe("2025-01-01");
    expect(sheetMonth("DEZ-2021")).toBe("2021-12-01");
    expect(sheetMonth("LEGENDA")).toBeNull();
    expect(sheetMonth("Tabela de USOS")).toBeNull();
  });
  it("datas: Date, serial do Excel e dd/mm/aaaa", () => {
    expect(toDate(new Date(Date.UTC(2025, 10, 14)))).toBe("2025-11-14");
    expect(toDate(44186)).toBe("2020-12-21");
    expect(toDate("29/08/2025")).toBe("2025-08-29");
  });
  it("regra 11.1: hash estável e sensível a qualquer coluna", () => {
    expect(hashRow(linha())).toBe(hashRow(linha()));
    expect(hashRow(linha())).not.toBe(hashRow(linha({ "Valor Financiado": 500001 })));
  });
  it("7.2: compra e venda pela natureza '1.'", () => {
    expect(isPurchase("1.Compra e venda")).toBe(true);
    expect(isPurchase("4.Arrematação")).toBe(false);
    expect(isPurchase("17.Resolução da alienação fiduciária")).toBe(false);
  });
  it("regra 11.14: fração ≥ 1 (ou nula) + complemento de unidade", () => {
    expect(isUnitWithoutOwnRecord(1, "APTO 12")).toBe(true);
    expect(isUnitWithoutOwnRecord(null, "BL B AP 3")).toBe(true);
    expect(isUnitWithoutOwnRecord(1, "T2 SALA 4")).toBe(true);
    expect(isUnitWithoutOwnRecord(0.0158, "APTO 72")).toBe(false); // tem cadastro próprio
    expect(isUnitWithoutOwnRecord(1, "CASA 2")).toBe(false);
    expect(isUnitWithoutOwnRecord(1, null)).toBe(false);
  });
  it("converte a guia: SQL e CEP com zeros à esquerda, proporção em fração, matrícula só dígitos", () => {
    const g = toGuia(linha({ "Matrícula do Imóvel": "053.678" }), COL, "2025-07-01")!;
    expect(g).toMatchObject({
      sql: "01501401564", cep: "05415011", numero: 577, dataTransacao: "2025-07-15", mesReferencia: "2025-07-01",
      ehCompraVenda: true, valorDeclarado: 1256081.09, proporcaoTransmitida: 1, matricula: "53678",
      usoIptuGuia: "APARTAMENTO EM CONDOMÍNIO (EXIGE FRAÇÃO IDEAL)", unidadeSemCadastroProprio: false,
    });
  });
  it("linha sem SQL ou sem data é inválida (rodapé)", () => {
    expect(toGuia(linha({ "N° do Cadastro (SQL)": null }), COL, "2025-07-01")).toBeNull();
    expect(toGuia(linha({ "Data de Transação": null }), COL, "2025-07-01")).toBeNull();
  });
});

describe("leitor do ITBI com planilha gerada (abas mensais 28 colunas e variante 2021; LEGENDA ignorada)", () => {
  async function planilha(abas: { nome: string; cab: string[]; linhas: unknown[][] }[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    for (const a of abas) {
      const ws = wb.addWorksheet(a.nome);
      ws.addRow(a.cab);
      for (const l of a.linhas) ws.addRow(l);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("lê as abas mensais pelo nome do cabeçalho e ignora as auxiliares", async () => {
    const buf = await planilha([
      { nome: "LEGENDA", cab: ["Campo", "Explicação"], linhas: [["SQL", "número do contribuinte"]] },
      { nome: "JUL-2025", cab: CAB_2025, linhas: [linha(), linha({ "Complemento": "APTO 14", "N° do Cadastro (SQL)": 1501401343 })] },
      { nome: "NOV-2025", cab: CAB_2021, linhas: [linha({ "Complemento": "APTO.11", "N° do Cadastro (SQL)": 1501401319 }), []] },
    ]);
    const r = await readItbiWorkbook(buf);
    expect(r.ano).toBe(2025);
    expect(r.guias.map((g) => [g.sql, g.mesReferencia])).toEqual([
      ["01501401564", "2025-07-01"], ["01501401343", "2025-07-01"], ["01501401319", "2025-11-01"],
    ]);
    expect(await workbookYear(buf)).toBe(2025);
  });

  // Bug da planilha real de 2024: JAN-2024 e OUT-2024 vêm SEM a linha de cabeçalho (dados desde a
  // linha 1). A aba sem cabeçalho usa o cabeçalho de outra aba mensal do mesmo arquivo, com o mesmo
  // número de colunas, e a 1ª linha conta como dado.
  it("aba sem cabeçalho usa o cabeçalho de outra aba mensal do arquivo (planilha real de 2024)", async () => {
    const buf = await planilha([
      { nome: "JAN-2024", cab: linha({ "N° do Cadastro (SQL)": 1008002970 }) as string[], linhas: [linha({ "N° do Cadastro (SQL)": 1008002971 })] },
      { nome: "FEV-2024", cab: CAB_2025, linhas: [linha({ "N° do Cadastro (SQL)": 1008002972 })] },
    ].map((a) => ({ ...a, linhas: a.linhas.map((l) => l.map((v) => (v instanceof Date ? v : v))) })));
    const r = await readItbiWorkbook(buf);
    expect(r.guias.map((g) => [g.sql, g.mesReferencia])).toEqual([
      ["01008002970", "2024-01-01"], ["01008002971", "2024-01-01"], ["01008002972", "2024-02-01"],
    ]);
    expect(r.porAba).toEqual({ "JAN-2024": 2, "FEV-2024": 1 });
  });

  it("nenhuma aba com cabeçalho → erro claro", async () => {
    const buf = await planilha([{ nome: "JAN-2024", cab: linha() as string[], linhas: [linha()] }]);
    await expect(readItbiWorkbook(buf)).rejects.toThrow(/sem cabeçalho/);
  });

  it("abas de anos diferentes → erro", async () => {
    const buf = await planilha([{ nome: "DEZ-2024", cab: CAB_2025, linhas: [linha()] }, { nome: "JAN-2025", cab: CAB_2025, linhas: [linha()] }]);
    await expect(readItbiWorkbook(buf)).rejects.toThrow(/anos diferentes/);
  });
});

describe("regra 11.2 nas guias", () => {
  const BAIRROS: Neighborhood[] = [
    { id: 1, slug: "perdizes", prefixosCep: ["050", "0125"], padroesNome: ["^PERDIZES$"] },
    { id: 3, slug: "pinheiros", prefixosCep: ["054"], padroesNome: ["^PINHEIROS$"] },
    { id: 4, slug: "vila-madalena", prefixosCep: ["054"], padroesNome: ["^(VILA|VL\\.?) MADALENA$"] },
  ];
  const g = (sql: string, bairroCampo: string | null, cep: string | null): Guia =>
    ({ ...toGuia(linha(), COL, "2025-07-01")!, sql, bairroCampo, cep, hashLinha: `${sql}-${bairroCampo}-${cep}` });

  it("passo 1 (campo), com o CEP precisando ter o prefixo do bairro", () => {
    expect(fieldNeighborhood("Vl. Madalena", BAIRROS)).toBe(4);
    const r = assignNeighborhoods([g("01501401564", "PINHEIROS", "05415011"), g("01501401565", "PINHEIROS", "01310000")], BAIRROS, new Map());
    expect(r.atribuidas.map((a) => [a.guia.sql, a.bairroId, a.origem])).toEqual([["01501401564", 3, "campo"]]);
    expect(r.descartes).toEqual({ "CEP fora dos prefixos do bairro (passo campo)": 1 });
  });

  it("passo 2 (iptu): SQL cadastrado → bairro do prédio", () => {
    const r = assignNeighborhoods([g("01501401564", null, "05415011")], BAIRROS, new Map([["01501401564", 3]]));
    expect(r.atribuidas[0]).toMatchObject({ bairroId: 3, origem: "iptu" });
  });

  it("passos 3 (voto por CEP) e 4 (voto por quadra), ≥ 60% e ≥ 2 votos", () => {
    expect(vote([3, 3, 4])).toBe(3);
    expect(vote([3, 4])).toBeNull();
    expect(vote([3])).toBeNull();
    const conhecidas = [g("01501400011", "PINHEIROS", "05415011"), g("01501400021", "PINHEIROS", "05415011"), g("01501400031", "PINHEIROS", "05415099")];
    const r = assignNeighborhoods(
      [...conhecidas, g("01501409991", null, "05415011"), g("01501409992", null, "05415077"), g("09999909993", null, "05415066")],
      BAIRROS, new Map(),
    );
    const origem = (sql: string) => r.atribuidas.find((a) => a.guia.sql === sql)?.origem;
    expect(origem("01501409991")).toBe("cep"); // mesmo CEP de 2 guias de Pinheiros
    expect(origem("01501409992")).toBe("quadra"); // CEP sem votos; quadra 015014 com 3 votos
    expect(origem("09999909993")).toBeUndefined(); // nenhum passo achou bairro
    expect(r.descartes["fora dos 10 bairros (nenhum passo da 11.2 achou bairro)"]).toBe(1);
  });
});

describe("página da Fazenda", () => {
  it("extrai links .xlsx absolutos, sem repetição", () => {
    const html = `<a href="https://x.sp.gov.br/a/GUIAS%20(28012026).xlsx">2025</a> <a href="/b/GUIAS-2024.xlsx">2024</a> <a href="/b/GUIAS-2024.xlsx">de novo</a> <a href="/c.pdf">pdf</a>`;
    expect(extractXlsxLinks(html, "https://prefeitura.sp.gov.br/fazenda/w/31501")).toEqual([
      "https://x.sp.gov.br/a/GUIAS%20(28012026).xlsx", "https://prefeitura.sp.gov.br/b/GUIAS-2024.xlsx",
    ]);
  });
});
