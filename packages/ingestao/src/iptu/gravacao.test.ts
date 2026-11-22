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

// Regra 11.11 (apontado pelo verifier do 8.2): a carga do IPTU não pode alterar planta
// confirmada em revisão manual — nem área de referência nem quantidade.
describe("writeBuildings: regra 11.11, planta confirmada manualmente não é alterada", () => {
  it("planta 'confirmada' com fonte 'revisao_manual' fica fora do upsert de plantas", async () => {
    const gravadas: { id: string }[][] = [];
    const db = {
      from: (tabela: string) => ({
        upsert: (linhas: { id?: string; chave_predio?: string }[]) => {
          if (tabela === "m2_plantas") gravadas.push(linhas as { id: string }[]);
          return {
            select: async () => ({ data: linhas.map((l) => ({ id: "predio-1", chave_predio: l.chave_predio })), error: null }),
            then: (ok: (v: unknown) => void) => ok({ data: null, error: null }),
          };
        },
        select: () => ({
          in: async () => ({
            data: [
              { id: "planta-confirmada", predio_id: "predio-1", area_iptu_referencia: 100, selo: "confirmada", fonte_area: "revisao_manual" },
              { id: "planta-calibrada", predio_id: "predio-1", area_iptu_referencia: 200, selo: "calibrada", fonte_area: "anuncio" },
            ],
            error: null,
          }),
        }),
      }),
    } as unknown as Parameters<typeof writeBuildings>[0];
    const b = { ...building(1), plantas: [{ areaIptuReferencia: 101, qtdUnidades: 9 }, { areaIptuReferencia: 201, qtdUnidades: 7 }] };
    const counts = await writeBuildings(db, [b]);
    const ids = gravadas.flat().map((p) => p.id);
    expect(ids).not.toContain("planta-confirmada"); // não sobrescreve área/quantidade da confirmada
    expect(ids).toContain("planta-calibrada"); // as demais continuam atualizadas
    expect(counts.plantasNovas).toBe(0); // a confirmada continua casada (unidades apontam para ela)
  });
});

// Mesmo risco do ITBI (max_rows = 1.000 do PostgREST corta em silêncio): ler as plantas de
// 100 prédios de uma vez pode passar de 1.000 linhas (até 20 plantas por prédio no IPTU 2026);
// plantas cortadas viriam como "novas" e seriam duplicadas. A leitura precisa paginar.
describe("writeBuildings: leitura das plantas existentes não perde linhas acima de 1.000", () => {
  it("100 prédios com 20 plantas cada: todas casam, nenhuma planta nova", async () => {
    const MAX_ROWS = 1000;
    const plantasExistentes = Array.from({ length: 100 }, (_, p) =>
      Array.from({ length: 20 }, (_, k) => ({ id: `pl-${p}-${k}`, predio_id: `id-${p + 1}`, area_iptu_referencia: 50 + k * 10, selo: "sem_dado", fonte_area: null })),
    ).flat();
    let n = 0;
    const db = {
      from: (tabela: string) => ({
        upsert: (linhas: { chave_predio?: string }[]) => ({
          select: async () => ({ data: linhas.map((l) => ({ id: `id-${++n}`, chave_predio: l.chave_predio })), error: null }),
          then: (ok: (v: unknown) => void) => ok({ data: null, error: null }),
        }),
        select: () => {
          const q = {
            ids: [] as string[], de: 0, ate: MAX_ROWS - 1,
            in(_c: string, ids: string[]) { q.ids = ids; return q; },
            order() { return q; },
            range(de: number, ate: number) { q.de = de; q.ate = ate; return q; },
            then(ok: (v: unknown) => void) {
              const todas = plantasExistentes.filter((p) => q.ids.includes(p.predio_id));
              const fim = Math.min(q.ate, q.de + MAX_ROWS - 1);
              ok({ data: tabela === "m2_plantas" ? todas.slice(q.de, fim + 1) : [], error: null });
            },
          };
          return q;
        },
      }),
    } as unknown as Parameters<typeof writeBuildings>[0];
    const predios = Array.from({ length: 100 }, (_, i) => ({
      ...building(i + 1),
      plantas: Array.from({ length: 20 }, (_, k) => ({ areaIptuReferencia: 50 + k * 10, qtdUnidades: 1 })),
    }));
    const counts = await writeBuildings(db, predios);
    expect(counts.plantasNovas).toBe(0);
    expect(counts.plantasAtualizadas).toBe(2000);
  });
});
