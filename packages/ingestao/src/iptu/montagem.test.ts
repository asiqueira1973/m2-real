import { describe, expect, it } from "vitest";
import {
  assembleBuildings,
  groupPlans,
  inferFloor,
  matchNeighborhoodByField,
  unitType,
  voteNeighborhood,
  type IptuRow,
  type Neighborhood,
} from "./montagem.js";

// Bairros como no seed (tabela 11.2), com ids fictícios.
const BAIRROS: Neighborhood[] = [
  { id: 1, slug: "perdizes", prefixosCep: ["050", "0125"], padroesNome: ["^PERDIZES$"] },
  { id: 2, slug: "pompeia", prefixosCep: ["050"], padroesNome: ["^(VILA |VL\\.? |V\\. )?POMPEIA$"] },
  { id: 3, slug: "pinheiros", prefixosCep: ["054"], padroesNome: ["^PINHEIROS$"] },
  { id: 4, slug: "vila-madalena", prefixosCep: ["054"], padroesNome: ["^(VILA|VL\\.?) MADALENA$"] },
  { id: 5, slug: "alto-de-pinheiros", prefixosCep: ["054"], padroesNome: ["^ALTO (DE |DOS )?PINHEIROS$"] },
  { id: 6, slug: "alto-da-lapa", prefixosCep: ["050", "054"], padroesNome: ["^ALTO DA LAPA$"] },
  { id: 7, slug: "higienopolis", prefixosCep: ["012", "013"], padroesNome: ["^HIGIENOPOLIS$"] },
  { id: 8, slug: "jardins", prefixosCep: ["014"], padroesNome: ["^(JARDIM|JD\\.?) (PAULISTA|AMERICA|EUROPA|PAULISTANO)$"] },
  { id: 9, slug: "cerqueira-cesar", prefixosCep: ["013", "014", "0540"], padroesNome: ["^CERQUEIRA CE[SZ]AR$"] },
  { id: 10, slug: "itaim-bibi", prefixosCep: ["045"], padroesNome: ["^(ITAIM ?BIBI|ITAIM|VL\\.? ITAIM|VILA ITAIM)$"] },
];

const APTO = "APARTAMENTO EM CONDOMÍNIO (EXIGE FRAÇÃO IDEAL)";
const GARAGEM = "GARAGEM (EXCLUSIVE EM PRÉDIO EM CONDOMÍNIO)";

function row(p: Partial<IptuRow> & Pick<IptuRow, "sql">): IptuRow {
  return {
    exercicio: 2026,
    numeroCondominio: "01-1",
    logradouro: "R JOAQUIM ANTUNES",
    numero: 577,
    complemento: null,
    bairro: "PINHEIROS",
    cep: "05415010",
    fracaoIdeal: 0.05,
    areaConstruida: 132,
    anoConstrucao: 1978,
    pavimentos: 10,
    uso: APTO,
    padrao: "RESIDENCIAL VERTICAL PADRAO C",
    ...p,
  };
}

describe("regra 11.3: tipo de unidade", () => {
  it.each([
    [APTO, "apartamento"],
    ["apartamento em condomínio (exige fração ideal)", "apartamento"],
    [GARAGEM, "vaga"],
    ["LOJA EM EDIFÍCIO EM CONDOMÍNIO (UNIDADE AUTÔNOMA EXIGE FRAÇÃO IDEAL)", "outro"],
    ["ESCRITÓRIO/CONSULTÓRIO EM CONDOMÍNIO", "outro"],
  ])("%s → %s", (uso, tipo) => expect(unitType(uso)).toBe(tipo));
});

describe("regra 11.7: andar inferido do complemento", () => {
  it.each([
    ["APTO 72", 7],
    ["AP 24", 2],
    ["APTO 1201", 12],
    ["APTO 101", 1],
    ["Apto 163 Bloc L", 1],
    ["AP 5", 0],
    ["CASA", null],
    [null, null],
    // Bug da 2ª carga real: vaga com matrícula no complemento virava andar 12035025 (estoura smallint).
    ["VG M.98063", null],
    ["VG MAT 55363", null],
    ["VG M78745 5 ORI", null],
  ])("%s → %s", (comp, andar) => expect(inferFloor(comp)).toBe(andar));
});

describe("regra 11.7: plantas por área (3% da mediana)", () => {
  it("separa 132 m² de 169 m² e junta variações pequenas", () => {
    const { plantas, indexOf } = groupPlans([132, 169, 131.5, 170, 132.4]);
    expect(plantas).toEqual([
      { areaIptuReferencia: 132, qtdUnidades: 3 },
      { areaIptuReferencia: 169.5, qtdUnidades: 2 },
    ]);
    expect(indexOf).toEqual([0, 1, 0, 1, 0]);
  });

  it("3% exato fica na mesma planta; acima de 3% abre outra", () => {
    expect(groupPlans([100, 103]).plantas).toHaveLength(1);
    expect(groupPlans([100, 103.5]).plantas).toHaveLength(2);
  });
});

describe("regra 11.2 aplicada ao prédio: campo bairro (passo 1)", () => {
  const slugDe = (id: number | null) => BAIRROS.find((b) => b.id === id)?.slug ?? null;
  it.each([
    ["05415010", "PINHEIROS", "pinheiros"],
    ["05415010", "Vila Madalena", "vila-madalena"],
    ["05415010", "ALTO DOS PINHEIROS", "alto-de-pinheiros"],
    ["05010000", "VL POMPEIA", "pompeia"],
    ["01310000", "CERQUEIRA CESAR", "cerqueira-cesar"],
    ["04538000", "ITAIM BIBI", "itaim-bibi"],
  ])("CEP %s, campo %s → %s", (cep, campo, slug) => {
    expect(slugDe(matchNeighborhoodByField(cep, campo, BAIRROS))).toBe(slug);
  });

  it.each([
    ["01220000", "SANTA CECILIA"], // centro: prefixo 012 é de Higienópolis, mas o campo não é
    ["04510000", "MOEMA"], // prefixo 045 é do Itaim, mas o campo não é
    ["05415010", null], // campo vazio não decide no passo 1
    ["05010000", "TORRE A"], // lixo no campo
    ["04538000", "JD PAULISTA"], // padrão de Jardins, mas o CEP 045 não é prefixo de Jardins
  ])("CEP %s, campo %s → nulo", (cep, campo) => {
    expect(matchNeighborhoodByField(cep, campo, BAIRROS)).toBeNull();
  });
});

describe("regra 11.2 aplicada ao prédio: votação (passos 3 e 4)", () => {
  it("vence com ≥ 60% e ≥ 2 votos, se o prefixo do CEP for do bairro", () => {
    expect(voteNeighborhood([3, 3, 4], "05415010", BAIRROS)).toBe(3); // 67%
    expect(voteNeighborhood([3, 4], "05415010", BAIRROS)).toBeNull(); // 50%
    expect(voteNeighborhood([3], "05415010", BAIRROS)).toBeNull(); // 1 voto
    expect(voteNeighborhood([3, 3], "01310000", BAIRROS)).toBeNull(); // Pinheiros não tem prefixo 013
    expect(voteNeighborhood([], "05415010", BAIRROS)).toBeNull();
  });
});

describe("regras 11.4 e 11.6: montagem de prédios", () => {
  // Prédio tipo Joaquim Antunes, 577: 5 apartamentos de ≈132 m² + 2 vagas com SQL próprio.
  const joaquim = [
    ...[11, 14, 72, 101, 112].map((ap, i) =>
      row({ sql: `0810020${String(i + 1).padStart(3, "0")}1`, complemento: `APTO ${ap}`, areaConstruida: 131.8 + i * 0.1 }),
    ),
    row({ sql: "08100200901", complemento: "VAGA 1", uso: GARAGEM, areaConstruida: 23 }),
    row({ sql: "08100200911", complemento: "VAGA 2", uso: GARAGEM, areaConstruida: 23 }),
  ];
  // Prédio tipo Caiubi, 324: 4 apartamentos de ≈169 m², sem vagas próprias.
  const caiubi = [1, 2, 3, 4].map((n) =>
    row({
      sql: `0200010${String(n).padStart(3, "0")}1`, numeroCondominio: "02-5", logradouro: "R. CAIUBI", numero: 324,
      cep: "05010000", bairro: "PERDIZES", complemento: `AP ${n * 10 + 4}`, areaConstruida: 169,
    }),
  );
  const pequeno = [1, 2, 3].map((n) => row({ sql: `030002${n}0001`, numeroCondominio: "03-1", areaConstruida: 80 }));
  const casa = row({ sql: "04000300011", numeroCondominio: "00-0", uso: "RESIDENCIA HORIZONTAL" });

  const { buildings, discarded } = assembleBuildings([...joaquim, ...caiubi, ...pequeno, casa], BAIRROS);

  it("monta os dois prédios com ≥ 4 apartamentos", () => {
    expect(buildings.map((b) => b.chavePredio).sort()).toEqual(["020-001-02-5", "081-002-01-1"]);
  });

  it("Joaquim Antunes: vagas com cadastro próprio, uma planta de ≈132 m², vagas sem planta", () => {
    const b = buildings.find((x) => x.chavePredio === "081-002-01-1")!;
    expect(b.vagasCadastroProprio).toBe(true);
    expect(b.totalUnidadesResidenciais).toBe(5);
    expect(b.plantas).toEqual([{ areaIptuReferencia: 132, qtdUnidades: 5 }]);
    expect(b.logradouro).toBe("RUA JOAQUIM ANTUNES");
    expect(b.units.filter((u) => u.tipoUnidade === "vaga").every((u) => u.plantaIndex === null)).toBe(true);
    expect(b.units.find((u) => u.complemento === "APTO 72")?.andarInferido).toBe(7);
    expect(BAIRROS.find((x) => x.id === b.bairroId)?.slug).toBe("pinheiros");
  });

  it("Caiubi: sem vaga com cadastro próprio, planta de 169 m², Perdizes", () => {
    const b = buildings.find((x) => x.chavePredio === "020-001-02-5")!;
    expect(b.vagasCadastroProprio).toBe(false);
    expect(b.plantas).toEqual([{ areaIptuReferencia: 169, qtdUnidades: 4 }]);
    expect(b.logradouro).toBe("RUA CAIUBI");
    expect(BAIRROS.find((x) => x.id === b.bairroId)?.slug).toBe("perdizes");
  });

  it("Joaquim Antunes resolvido pelo campo; números do imóvel guardados (P3)", () => {
    const b = buildings.find((x) => x.chavePredio === "081-002-01-1")!;
    expect(b.origemBairro).toBe("campo");
    expect(b.numerosImovel).toEqual([577]);
  });

  it("descarta grupo com < 4 apartamentos e linha sem condomínio, com motivo", () => {
    expect(discarded).toEqual(
      expect.arrayContaining([
        { chave: "*", motivo: "sem número de condomínio (regra 11.4)", linhas: 1 },
        { chave: "030-002-03-1", motivo: "menos de 4 apartamentos (regra 11.4)", linhas: 3 },
      ]),
    );
  });
});

describe("montagem: bairro por voto e prédios fora dos 10 bairros (regra 11.2; P3)", () => {
  const predio = (cond: string, quadra: string, p: Partial<IptuRow>, n = 4, numeros?: number[]) =>
    Array.from({ length: n }, (_, i) =>
      row({ sql: `081${quadra}${cond}${String(i).padStart(2, "0")}1`, numeroCondominio: `${cond}-1`, numero: numeros?.[i] ?? 577, ...p }));
  const rows = [
    ...predio("11", "010", { bairro: "PINHEIROS", cep: "05415099" }),
    ...predio("12", "010", { bairro: "PINHEIROS", cep: "05415099" }),
    ...predio("13", "010", { bairro: null, cep: "05415099" }), // campo vazio, mesmo CEP → voto por CEP
    ...predio("14", "010", { bairro: null, cep: "05415098" }), // campo vazio, CEP sem votos → voto por quadra
    ...predio("15", "020", { bairro: "SANTA CECILIA", cep: "01220000" }), // centro → fora
    ...predio("16", "030", { bairro: "PINHEIROS", cep: "05415097" }, 4, [115, 117, 125, 127]), // P3: vários números
  ];
  const { buildings, discarded } = assembleBuildings(rows, BAIRROS);
  const por = (cond: string) => buildings.find((b) => b.numeroCondominio === `${cond}-1`);

  it("campo vazio é resolvido pelo voto do CEP de 8 dígitos", () => {
    expect(por("13")).toMatchObject({ origemBairro: "cep", bairroId: 3 });
  });

  it("sem voto no CEP, resolve pelo voto da quadra (setor+quadra)", () => {
    expect(por("14")).toMatchObject({ origemBairro: "quadra", bairroId: 3 });
  });

  it("prédio do centro com CEP 012 não entra em Higienópolis", () => {
    expect(por("15")).toBeUndefined();
    expect(discarded).toEqual(expect.arrayContaining([
      { chave: "081-020-15-1", motivo: "fora dos 10 bairros ou bairro indecidível (regra 11.2)", linhas: 4 },
    ]));
  });

  it("P3: um prédio por condomínio, com todos os números do imóvel", () => {
    expect(por("16")).toMatchObject({ numerosImovel: [115, 117, 125, 127] });
  });
});
