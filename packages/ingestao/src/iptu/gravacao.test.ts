import { describe, expect, it } from "vitest";
import { matchPlants } from "./gravacao.js";

describe("matchPlants: plantas existentes preservadas entre cargas (regras 11.7 e 11.11)", () => {
  const existentes = [
    { id: "p132", areaIptuReferencia: 132 },
    { id: "p169", areaIptuReferencia: 169 },
  ];

  it("grupo com área igual ou a até 3% reaproveita a planta (mantém selo e calibração)", () => {
    expect(matchPlants(existentes, [{ areaIptuReferencia: 133, qtdUnidades: 40 }, { areaIptuReferencia: 169, qtdUnidades: 8 }])).toEqual(["p132", "p169"]);
  });

  it("grupo sem par a 3% vira planta nova (nulo)", () => {
    expect(matchPlants(existentes, [{ areaIptuReferencia: 250, qtdUnidades: 2 }])).toEqual([null]);
  });

  it("cada planta existente casa com no máximo um grupo, o mais próximo", () => {
    expect(matchPlants(existentes, [{ areaIptuReferencia: 131, qtdUnidades: 1 }, { areaIptuReferencia: 132, qtdUnidades: 1 }])).toEqual([null, "p132"]);
  });

  it("primeira carga: tudo novo", () => {
    expect(matchPlants([], [{ areaIptuReferencia: 132, qtdUnidades: 40 }])).toEqual([null]);
  });
});

// Bug da 1ª carga real (21/11/2026): "Falha ao ler m2_plantas: URI too long" — a leitura
// das plantas existentes mandava os 500 ids do lote na URL (.in). O filtro precisa ir em
// pedaços que caibam na URL.
import { writeBuildings } from "./gravacao.js";
import type { Building } from "./montagem.js";

const MAX_IDS_NA_URL = 100; // ~3,7 KB de UUIDs: abaixo do limite de URL do PostgREST/Kong

/** Cliente falso: aceita o encadeamento usado por writeBuildings e falha como o banco real se a URL ficar grande. */
function fakeDb() {
  let n = 0;
  const resposta = (data: unknown) => ({ data, error: null });
  const tabela = (nome: string) => ({
    upsert: (linhas: { chave_predio?: string }[]) => ({
      select: async () => resposta(linhas.map((l) => ({ id: `id-${++n}`, chave_predio: l.chave_predio }))),
      then: (ok: (v: unknown) => void) => ok(resposta(null)),
    }),
    select: () => ({
      in: async (_col: string, ids: string[]) =>
        ids.length > MAX_IDS_NA_URL ? { data: null, error: { message: "URI too long" } } : resposta([]),
    }),
    nome,
  });
  return { from: tabela } as unknown as Parameters<typeof writeBuildings>[0];
}

function building(i: number): Building {
  return {
    chavePredio: `001-001-${i}-1`, setor: "001", quadra: "001", numeroCondominio: `${i}-1`, bairroId: 1,
    origemBairro: "campo", logradouro: "RUA X", numero: i, numerosImovel: [i], cep: "05010000", anoConstrucao: 1980,
    qtdPavimentos: 10, padraoIptu: null, totalUnidadesResidenciais: 4, vagasCadastroProprio: false, exercicioIptu: 2026,
    plantas: [{ areaIptuReferencia: 100, qtdUnidades: 4 }], units: [],
  };
}

describe("writeBuildings: lotes que cabem na URL (bug da 1ª carga real)", () => {
  it("grava 500 prédios sem estourar o tamanho da URL ao ler plantas existentes", async () => {
    const counts = await writeBuildings(fakeDb(), Array.from({ length: 500 }, (_, i) => building(i + 1)));
    expect(counts.predios).toBe(500);
    expect(counts.plantasNovas).toBe(500);
  });
});
