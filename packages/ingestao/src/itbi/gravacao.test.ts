import { describe, expect, it } from "vitest";
import { insertGuias, lookupUnits } from "./gravacao.js";
import type { GuiaComBairro } from "./bairro.js";

// Bug da 1ª carga completa do ITBI (22/11/2026): com o Docker sob carga, chamadas ao banco
// passaram do limite de 8 s do PostgREST ("canceling statement due to statement timeout") e
// os anos 2021–2023 falharam; rodando de novo, passaram. As operações são idempotentes, então
// erro transitório deve ser repetido (com espera) antes de falhar a execução.
const TIMEOUT = { message: "canceling statement due to statement timeout", code: "57014" };

function fakeDb(falhasAntes: number) {
  let chamadas = 0;
  const responder = <T>(data: T) => (++chamadas <= falhasAntes ? { data: null, error: TIMEOUT } : { data, error: null });
  const db = {
    rpc: async () => responder([{ sql: "01501401564", unidade_id: "u1", predio_id: "p1", bairro_id: 3 }]),
    from: () => ({ upsert: () => ({ select: async () => responder([{ id: "t1" }]) }) }),
  };
  return { db: db as unknown as Parameters<typeof insertGuias>[0], chamadas: () => chamadas };
}

const guia = { guia: { hashLinha: "h1", sql: "01501401564" }, bairroId: 3, origem: "campo" } as unknown as GuiaComBairro;
const semEspera = { esperasMs: [0, 0, 0] };

describe("gravação do ITBI: erro transitório do banco é repetido", () => {
  it("lookupUnits repete após timeout e devolve o resultado", async () => {
    const { db, chamadas } = fakeDb(2);
    const r = await lookupUnits(db, ["01501401564"], semEspera);
    expect(r.get("01501401564")?.unidadeId).toBe("u1");
    expect(chamadas()).toBe(3);
  });

  it("insertGuias repete após timeout", async () => {
    const { db } = fakeDb(1);
    expect(await insertGuias(db, [guia], "e1", new Map(), semEspera)).toBe(1);
  });

  it("depois de esgotar as tentativas, falha com a mensagem do banco", async () => {
    const { db } = fakeDb(10);
    await expect(lookupUnits(db, ["01501401564"], semEspera)).rejects.toThrow(/statement timeout/);
  });
});

// Bug achado ao medir o RPC (22/11/2026): o PostgREST corta toda resposta em 1.000 linhas
// (max_rows). Com lotes de 5.000 SQLs, um lote com mais de 1.000 SQLs cadastrados perderia
// unidades EM SILÊNCIO (sem erro). Cada SQL casa no máximo uma unidade: lote ≤ 1.000 nunca corta.
describe("lookupUnits: nenhum lote passa do limite de 1.000 linhas do PostgREST", () => {
  it("2.500 SQLs cadastrados voltam todos", async () => {
    const MAX_ROWS = 1000;
    const db = {
      rpc: async (_fn: string, { sqls }: { sqls: string[] }) => ({
        data: sqls.slice(0, MAX_ROWS).map((sql) => ({ sql, unidade_id: `u${sql}`, predio_id: "p", bairro_id: 1 })),
        error: null,
      }),
    } as unknown as Parameters<typeof lookupUnits>[0];
    const sqls = Array.from({ length: 2500 }, (_, i) => String(i).padStart(11, "0"));
    const r = await lookupUnits(db, sqls, { esperasMs: [] });
    expect(r.size).toBe(2500);
  });
});
