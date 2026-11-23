// Épico 8.13: "Teste aqui" do site (regra 11.23).
import { beforeAll, describe, expect, it, vi } from "vitest";

const searchBuilding = vi.fn();
const buildingSales = vi.fn();
vi.mock("@/server/mcp/dados", () => ({ searchBuilding: (...a: unknown[]) => searchBuilding(...a), buildingSales: (...a: unknown[]) => buildingSales(...a) }));
vi.mock("@/server/mcp/ferramentas", () => ({ MENSAGENS_MCP: { foraDaCobertura: "fora" } }));
const { clientIp, ipHash, runSiteTest, MENSAGENS_TESTE } = await import("./teste");

const db = (permitido: boolean) => ({ rpc: vi.fn(async () => ({ data: permitido, error: null })) });
const passa = async () => true;
const venda = (data: string) => ({ data, valor_total: 1_000_000, valor_vagas: 100_000, unidade: "AP 1", area_privativa: null, selo_area: "sem_dado", m2_privativo: null });

// A partir dos ajustes do verifier, o HMAC exige SESSION_SECRET forte (como a sessão do cliente).
beforeAll(() => { vi.stubEnv("SESSION_SECRET", "s".repeat(40)); });

describe("teste do site (8.13; 11.23)", () => {
  it("sem SESSION_SECRET forte, o hash falha em vez de sair sem chave", () => {
    expect(() => ipHash("200.1.2.3", "curto")).toThrow(/SESSION_SECRET/);
  });
  it("hash do IP é estável, irreversível sem o segredo e não contém o IP", () => {
    expect(ipHash("200.1.2.3", "s".repeat(40))).toBe(ipHash("200.1.2.3", "s".repeat(40)));
    expect(ipHash("200.1.2.3", "s".repeat(40))).not.toContain("200.1.2.3");
    expect(ipHash("200.1.2.3", "a".repeat(40))).not.toBe(ipHash("200.1.2.3", "b".repeat(40)));
    expect(clientIp(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
  });
  it("endereço curto e robô falham antes de consultar o banco", async () => {
    const d = db(true);
    expect((await runSiteTest(d as never, "ab", "t", "ip", passa)).resultado).toEqual({ tipo: "erro", mensagem: MENSAGENS_TESTE.endereco });
    expect((await runSiteTest(d as never, "Rua X, 1", "", "ip", async () => false)).resultado).toEqual({ tipo: "erro", mensagem: MENSAGENS_TESTE.robo });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("não encontrado não gasta a busca", async () => {
    searchBuilding.mockResolvedValueOnce([]);
    const d = db(true);
    expect((await runSiteTest(d as never, "Rua Inexistente, 1", "t", "ip", passa)).resultado).toEqual({ tipo: "fora", mensagem: "fora" });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("bloqueado devolve o limite; permitido devolve só 3 vendas, com data, valor e vaga", async () => {
    const predio = { predio_id: "p", endereco: "RUA X, 1", bairro: "Perdizes", ano_construcao: 1974 };
    searchBuilding.mockResolvedValue([predio]);
    expect((await runSiteTest(db(false) as never, "Rua X, 1", "t", "ip", passa)).resultado).toEqual({ tipo: "limite" });
    buildingSales.mockResolvedValueOnce([venda("2026-09-21"), venda("2026-09-03"), venda("2026-01-20"), venda("2025-12-18")]);
    const r = (await runSiteTest(db(true) as never, "Rua X, 1", "t", "ip", passa)).resultado;
    expect(r).toEqual({
      tipo: "ok",
      predio: { endereco: "RUA X, 1", bairro: "Perdizes", ano_construcao: 1974 },
      vendas: ["2026-09-21", "2026-09-03", "2026-01-20"].map((data) => ({ data, valor_total: 1_000_000, valor_vagas: 100_000 })),
    });
  });
});
