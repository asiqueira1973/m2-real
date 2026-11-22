// Épico 8.10: o mcpHandler com as duas credenciais (6.3) e o limite de uso (regra 11.22).
import { beforeEach, describe, expect, it, vi } from "vitest";

let rpcLinhas: unknown[] = [];
let chave: unknown = null;
const after = vi.fn();
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => after(fn) }));
vi.mock("@m2-real/db/server", () => ({
  createServiceClient: () => ({
    rpc: async () => ({ data: rpcLinhas, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: chave, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const { mcpHandler } = await import("./handler");

// Pedido "initialize" do MCP: responde sem tocar no banco, então serve para ver se a credencial passou.
const pedido = (credencial?: string) => new Request("http://localhost/api/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(credencial ? { authorization: `Bearer ${credencial}` } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } } }),
});

beforeEach(() => {
  rpcLinhas = [];
  chave = null;
  after.mockReset();
});

describe("mcpHandler (6.3; 11.22)", () => {
  it("sem credencial → 401 com resource_metadata", async () => {
    const r = await mcpHandler(pedido());
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
  it("token OAuth ativo passa e não usa o after() da chave", async () => {
    rpcLinhas = [{ token_id: "t", permitido: true, espera_s: 0 }];
    const r = await mcpHandler(pedido("fpq_mcp_valido"));
    expect(r.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
  });
  it("token revogado ou de conta bloqueada (a função não devolve linha) → 401", async () => {
    expect((await mcpHandler(pedido("fpq_mcp_revogado"))).status).toBe(401);
  });
  it("token no limite → 429 com Retry-After", async () => {
    rpcLinhas = [{ token_id: "t", permitido: false, espera_s: 17 }];
    const r = await mcpHandler(pedido("fpq_mcp_cheio"));
    expect([r.status, r.headers.get("retry-after")]).toEqual([429, "17"]);
  });
  it("chave do painel ativa passa e grava o último uso depois da resposta", async () => {
    chave = { id: "k", ativa: true };
    expect((await mcpHandler(pedido("chave-do-painel"))).status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
