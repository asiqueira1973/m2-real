// Épico 8.12: eventos de produto (seção 21) — catálogo fechado, id estável e só o nome da ferramenta.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayload, send, stableId, toolCalls } from "./visao";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("eventos do Visão de Produto (seção 21)", () => {
  it("primeira conexão: corpo no formato do ingest, id estável pela conta", () => {
    const a = buildPayload("fechou_por_quanto_primeira_conexao", "a@b.com", {}, "conta-1", new Date("2026-11-23T10:00:00Z"));
    const b = buildPayload("fechou_por_quanto_primeira_conexao", "a@b.com", {}, "conta-1");
    expect(a?.eventos[0]).toMatchObject({ nome: "fechou_por_quanto_primeira_conexao", distinct_id: "a@b.com", ocorrido_em: "2026-11-23T10:00:00.000Z", tela: "Entrar com Google", propriedades: {} });
    expect(a?.eventos[0]?.id).toBe(b?.eventos[0]?.id);
    expect(stableId("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("pergunta: catálogo fechado descarta propriedade a mais (ex.: o endereço)", () => {
    expect(buildPayload("fechou_por_quanto_pergunta", "a@b.com", { ferramenta: "vendas_predio", credencial: "oauth", cliente: "Claude" })?.eventos[0]?.propriedades)
      .toEqual({ ferramenta: "vendas_predio", credencial: "oauth", cliente: "Claude" });
    expect(buildPayload("fechou_por_quanto_pergunta", "a@b.com", { ferramenta: "vendas_predio", credencial: "oauth", cliente: null, endereco: "Rua X, 1" } as never)).toBeNull();
  });
  it("só tools/call vira evento, em lote ou não, e só ferramentas conhecidas", () => {
    expect(toolCalls({ method: "tools/call", params: { name: "buscar_predio", arguments: { endereco: "Rua X" } } })).toEqual(["buscar_predio"]);
    expect(toolCalls([{ method: "tools/list" }, { method: "tools/call", params: { name: "sobre" } }, { method: "tools/call", params: { name: "outra" } }])).toEqual(["sobre"]);
    expect(toolCalls(null)).toEqual([]);
  });
  it("sem as variáveis não envia; com elas, posta com a x-api-key", async () => {
    const f = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", f);
    await send({ eventos: [] }, "t");
    expect(f).not.toHaveBeenCalled();
    vi.stubEnv("VISAO_INGEST_URL", "https://ingest.test");
    vi.stubEnv("VISAO_API_KEY", "k");
    await send({ eventos: [] }, "t");
    expect(f).toHaveBeenCalledWith("https://ingest.test", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-api-key": "k" }) }));
  });
});
