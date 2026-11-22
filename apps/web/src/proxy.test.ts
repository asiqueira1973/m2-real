// Épico 8.11: o proxy (sessão do painel) roda no painel e nas rotas de API, e não no site público,
// no MCP nem no OAuth.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/supabase/env", () => ({ supabaseEnv: () => ({ url: "http://x", anonKey: "k" }) }));
const { config } = await import("./proxy");
const passa = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy.matcher (8.11)", () => {
  it("site público fora do proxy", () => {
    for (const u of ["/", "/conectar", "/privacidade", "/termos", "/robots.txt", "/sitemap.xml", "/site/hero.webp", "/opengraph-image"]) expect(passa(u), u).toBe(false);
  });
  it("MCP e OAuth fora do proxy", () => {
    for (const u of ["/mcp", "/api/mcp", "/oauth/entrar", "/.well-known/oauth-authorization-server", "/api/auth/google"]) expect(passa(u), u).toBe(false);
  });
  it("painel, login e APIs do painel passam pelo proxy", () => {
    for (const u of ["/painel", "/painel/predios", "/login", "/api/chaves", "/conectarx"]) expect(passa(u), u).toBe(true);
  });
});

describe("proxy.matcher ancorado (8.11)", () => {
  it("caminhos que só começam com icon ou opengraph-image passam pelo proxy", () => {
    expect(passa("/iconografia")).toBe(true);
    expect(passa("/opengraph-imagem-falsa/x")).toBe(true);
    expect(passa("/opengraph-image-abc123")).toBe(false);
  });
});
