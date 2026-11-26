// 8.14: reatribuição de bairro na carga forçada do ITBI (regra 11.2).
import { describe, expect, it, vi } from "vitest";
import { reassignNeighborhoods } from "./gravacao";

const guia = (h: string, bairroId: number) => ({ guia: { hashLinha: h } as never, bairroId, origem: "campo" as const });

describe("reassignNeighborhoods (8.14)", () => {
  it("manda em lotes e soma as guias que mudaram", async () => {
    const rpc = vi.fn(async (_f: string, a: { p_hashes: string[] }) => ({ data: a.p_hashes.length - 1, error: null }));
    const n = await reassignNeighborhoods({ rpc } as never, [guia("a", 11), guia("b", 12), guia("c", 13)], 2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1]).toEqual({ p_hashes: ["a", "b"], p_bairros: [11, 12], p_origens: ["campo", "campo"] });
    expect(n).toBe(1 + 0);
  });
  it("sem guias, não chama o banco", async () => {
    const rpc = vi.fn();
    expect(await reassignNeighborhoods({ rpc } as never, [])).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
