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
