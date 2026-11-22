import { describe, expect, it } from "vitest";
import { runWatch } from "./vigia.js";

const AGORA = new Date("2026-11-22T12:00:00Z");
const hoje = AGORA.toISOString();
const ROTINAS = ["ingestao-itbi", "ingestao-iptu", "coleta-anuncios", "coleta-leiloes", "calibracao"];

/** Banco falso: execuções, cobertura e a resposta da busca da sonda. */
function banco(execucoes: unknown[], sonda: { data: unknown; error: unknown }) {
  const tabela = (dados: unknown[]) => ({ select: () => ({ order: () => ({ limit: async () => ({ data: dados, error: null }) }) }) });
  return {
    from: (t: string) => tabela(t === "m2_execucoes_ingestao" ? execucoes : []),
    rpc: async () => sonda,
  } as unknown as Parameters<typeof runWatch>[0];
}
const emDia = ROTINAS.map((rotina) => ({ rotina, referencia: null, status: "concluida", iniciada_em: hoje, concluida_em: hoje, linhas_lidas: 10, linhas_gravadas: 10, mensagem_erro: null }));

describe("vigia (O3)", () => {
  it("tudo em dia e sonda achando o prédio → código 0", async () => {
    const r = await runWatch(banco(emDia, { data: [{ predio_id: "p" }], error: null }), AGORA);
    expect(r.codigo).toBe(0);
  });
  it("rotina que falhou → código 1, com o motivo no relatório", async () => {
    const falhou = emDia.map((e) => (e.rotina === "calibracao" ? { ...e, status: "falhou", mensagem_erro: "timeout" } : e));
    const r = await runWatch(banco(falhou, { data: [{ predio_id: "p" }], error: null }), AGORA);
    expect(r.codigo).toBe(1);
    expect(r.linhas.join("\n")).toMatch(/calibracao: falhou/);
  });
  it("sonda sintética sem resultado ou com erro → código 1", async () => {
    expect((await runWatch(banco(emDia, { data: [], error: null }), AGORA)).codigo).toBe(1);
    expect((await runWatch(banco(emDia, { data: null, error: { message: "fetch failed" } }), AGORA)).codigo).toBe(1);
  });
});
