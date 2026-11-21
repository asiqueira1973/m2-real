import { describe, expect, it } from "vitest";
import { MENSAGEM_TEMPO_ESGOTADO, runRoutine, type ExecutionStore, type RoutineResult } from "./execucao.js";

/** Store em memória que imita m2_execucoes_ingestao. */
function fakeStore() {
  const rows: Record<string, { status: string; iniciada: Date; mensagem?: string; result?: RoutineResult }> = {};
  let n = 0;
  const store: ExecutionStore = {
    async expireStale(olderThan, mensagem) {
      let c = 0;
      for (const r of Object.values(rows)) if (r.status === "em_andamento" && r.iniciada < olderThan) { r.status = "falhou"; r.mensagem = mensagem; c++; }
      return c;
    },
    async start() { const id = `e${++n}`; rows[id] = { status: "em_andamento", iniciada: AGORA }; return id; },
    async finish(id, result) { rows[id]!.status = "concluida"; rows[id]!.result = result; },
    async fail(id, mensagem) { rows[id]!.status = "falhou"; rows[id]!.mensagem = mensagem; },
  };
  return { store, rows };
}

const AGORA = new Date("2026-11-21T12:00:00Z");
const RESULT: RoutineResult = { linhasLidas: 10, linhasGravadas: 8, linhasDescartadas: 2 };

describe("runRoutine (seção 12; observabilidade O1)", () => {
  it("rotina sem erro → concluida com as contagens", async () => {
    const { store, rows } = fakeStore();
    const { id } = await runRoutine(store, "ingestao-iptu", "iptu", "2026", async () => RESULT, () => AGORA);
    expect(rows[id]).toMatchObject({ status: "concluida", result: RESULT });
  });

  it("rotina com erro → falhou com a mensagem, e o erro é relançado (exit ≠ 0 → e-mail do GitHub)", async () => {
    const { store, rows } = fakeStore();
    await expect(
      runRoutine(store, "ingestao-iptu", "iptu", "2026", async () => { throw new Error("coluna AREA CONSTRUIDA ausente"); }, () => AGORA),
    ).rejects.toThrow("coluna AREA CONSTRUIDA ausente");
    expect(rows.e1).toMatchObject({ status: "falhou", mensagem: "coluna AREA CONSTRUIDA ausente" });
  });

  it("antes de começar, marca como falhou ('tempo esgotado') o que está em andamento há mais de 6 h", async () => {
    const { store, rows } = fakeStore();
    rows.velha = { status: "em_andamento", iniciada: new Date(AGORA.getTime() - 7 * 3_600_000) };
    rows.recente = { status: "em_andamento", iniciada: new Date(AGORA.getTime() - 1 * 3_600_000) };
    await runRoutine(store, "calibracao", "itbi", null, async () => RESULT, () => AGORA);
    expect(rows.velha).toMatchObject({ status: "falhou", mensagem: MENSAGEM_TEMPO_ESGOTADO });
    expect(rows.recente!.status).toBe("em_andamento");
  });
});
