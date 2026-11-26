// 8.14: sem --forcar o ITBI continua pulando o ano de hash igual e não reatribui bairros;
// com --forcar, reprocessa e reatribui (plans/8.14-novos-bairros.md, decisão 3).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  read: vi.fn(),
  insert: vi.fn(async (..._a: unknown[]) => 1),
  replace: vi.fn(async (..._a: unknown[]) => 0),
  reassign: vi.fn(async (..._a: unknown[]) => 1),
  hash: "hash-da-planilha",
}));
vi.mock("../shared/xlsx.js", () => ({ listSheets: async () => [{ nome: "JAN-2025" }] }));
vi.mock("../shared/execucao.js", () => ({
  supabaseExecutionStore: () => ({}),
  runRoutine: async (_s: unknown, _r: unknown, _f: unknown, _ref: unknown, fn: (e: { id: string }) => Promise<unknown>) => ({ result: await fn({ id: "exec" }) }),
}));
vi.mock("../shared/brutos.js", () => ({ sha256: () => m.hash, storeRaw: async () => "itbi/2025.xlsx", rawStoreFromEnv: () => ({}) }));
vi.mock("../iptu/rotina.js", () => ({ loadNeighborhoods: async () => [] }));
vi.mock("./leitor.js", () => ({ readItbiWorkbook: (...a: unknown[]) => m.read(...a) }));
vi.mock("./bairro.js", () => ({ assignNeighborhoods: () => ({ atribuidas: [{ guia: { hashLinha: "g1" }, bairroId: 11, origem: "campo" }], descartes: {} }) }));
vi.mock("./gravacao.js", () => ({
  lookupUnits: async () => new Map(),
  insertGuias: (...a: unknown[]) => m.insert(...a),
  replaceYear: (...a: unknown[]) => m.replace(...a),
  reassignNeighborhoods: (...a: unknown[]) => m.reassign(...a),
}));

const { runItbi } = await import("./rotina");

/** Banco falso: a última execução concluída de 2025 tem o hash dado. */
const banco = (ultimoHash: string) => {
  const q: Record<string, unknown> = {};
  for (const f of ["select", "eq", "order", "limit"]) q[f] = () => q;
  q.maybeSingle = async () => ({ data: { arquivo_hash: ultimoHash, caminho_storage: "itbi/2025.xlsx" }, error: null });
  return { from: () => q } as never;
};
const arquivo = join(mkdtempSync(join(tmpdir(), "itbi-")), "itbi-2025.xlsx");
writeFileSync(arquivo, "x");

beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue({ ano: 2025, guias: [], linhasLidas: 5 });
});

describe("ITBI --forcar (8.14)", () => {
  it("sem --forcar e hash igual: pula o ano, não lê, não grava nem reatribui", async () => {
    const [r] = await runItbi(banco(m.hash), { arquivo });
    expect(r?.resultado?.linhasLidas).toBe(0);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.reassign).not.toHaveBeenCalled();
  });
  it("sem --forcar e hash novo: carrega, mas não reatribui bairros", async () => {
    await runItbi(banco("outro-hash"), { arquivo });
    expect(m.read).toHaveBeenCalledOnce();
    expect(m.insert).toHaveBeenCalledOnce();
    expect(m.reassign).not.toHaveBeenCalled();
  });
  it("com --forcar e hash igual: reprocessa e reatribui", async () => {
    const [r] = await runItbi(banco(m.hash), { arquivo, forcar: true });
    expect(r?.resultado?.linhasLidas).toBe(5);
    expect(m.reassign).toHaveBeenCalledOnce();
  });
});
