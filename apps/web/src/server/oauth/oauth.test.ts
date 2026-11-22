// Épico 8.10: OAuth do MCP, login com Google, sessão do cliente e limites (6.3, 6.5; 11.21, 11.22).
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const findClient = vi.fn();
const exchangeCode = vi.fn();
vi.mock("./server", async (orig) => ({ ...(await orig<typeof import("./server")>()), findClient: (...a: unknown[]) => findClient(...a), exchangeCode: (...a: unknown[]) => exchangeCode(...a) }));

const { acceptableRedirectUri, s256, MCP_TOKEN_PREFIX } = await import("./server");
const { checkAuthorizeParams, withParams } = await import("./authorize");
const { limiteAtingido } = await import("./mensagens");
const { decodeLoginCookie, encodeLoginCookie, safeReturnPath, signClientSession, verifyClientSession } = await import("@/server/auth/sessao-cliente");
const { verifyIdToken } = await import("@/server/auth/google");
const { tooManyRequests, unauthorized, verifyCredential } = await import("@/server/mcp/auth");
const tokenRoute = await import("@/app/oauth/token/route");
const metadados = await import("@/app/.well-known/oauth-protected-resource/[[...recurso]]/route");

const SEGREDO = "x".repeat(40);
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const CLIENTE = { id: "11111111-1111-4111-8111-111111111111", nome: "Claude", redirect_uris: [REDIRECT] };
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

beforeEach(() => {
  findClient.mockReset();
  exchangeCode.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = "https://fechouporquanto.com.br";
});

describe("6.5: registro e pedido de autorização", () => {
  it("redirect_uri: https, ou http só em localhost; sem fragmento nem credenciais", () => {
    expect(acceptableRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(acceptableRedirectUri("http://localhost:6274/cb")).toBe(true);
    expect(acceptableRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(acceptableRedirectUri("http://exemplo.com/cb")).toBe(false);
    expect(acceptableRedirectUri("https://exemplo.com/cb#x")).toBe(false);
    expect(acceptableRedirectUri("https://u:p@exemplo.com/cb")).toBe(false);
    expect(acceptableRedirectUri("javascript:alert(1)")).toBe(false);
  });
  it("PKCE S256 (vetor do RFC 7636)", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(CHALLENGE);
  });
  it("pedido válido; inválido devolve erro e nunca redireciona", async () => {
    findClient.mockResolvedValue(CLIENTE);
    const base = { response_type: "code", client_id: CLIENTE.id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: "S256", state: "s" };
    expect(await checkAuthorizeParams(base)).toMatchObject({ ok: true, req: { state: "s" } });
    expect(await checkAuthorizeParams({ ...base, redirect_uri: "https://malicioso.test/cb" })).toEqual({ ok: false, error: "invalid_request" });
    expect(await checkAuthorizeParams({ ...base, code_challenge_method: "plain" })).toEqual({ ok: false, error: "invalid_request" });
    expect(await checkAuthorizeParams({ ...base, response_type: "token" })).toEqual({ ok: false, error: "unsupported_response_type" });
    findClient.mockResolvedValue(null);
    expect(await checkAuthorizeParams(base)).toEqual({ ok: false, error: "invalid_request" });
  });
  it("volta mantém os parâmetros do cliente", () => {
    expect(withParams("https://c.test/cb?a=1", { code: "z" })).toBe("https://c.test/cb?a=1&code=z");
  });
  it("metadados do recurso apontam /mcp e o servidor de autorização (RFC 9728)", async () => {
    expect(await metadados.GET().json()).toMatchObject({ resource: "https://fechouporquanto.com.br/mcp", authorization_servers: ["https://fechouporquanto.com.br"] });
  });
});

describe("6.5, passo 5: POST /oauth/token", () => {
  const post = (campos: Record<string, string>) =>
    tokenRoute.POST(new Request("https://x/oauth/token", { method: "POST", body: new URLSearchParams(campos) }));
  const valido = { grant_type: "authorization_code", code: "c", client_id: CLIENTE.id, redirect_uri: REDIRECT, code_verifier: "v".repeat(43) };
  it("grant errado, verifier curto, cliente desconhecido e código inválido", async () => {
    expect((await (await post({ ...valido, grant_type: "password" })).json()).error).toBe("unsupported_grant_type");
    expect((await (await post({ ...valido, code_verifier: "curto" })).json()).error).toBe("invalid_request");
    findClient.mockResolvedValue(null);
    const r = await post(valido);
    expect([r.status, (await r.json()).error]).toEqual([401, "invalid_client"]);
    findClient.mockResolvedValue(CLIENTE);
    exchangeCode.mockResolvedValue(null);
    expect((await (await post(valido)).json()).error).toBe("invalid_grant");
  });
  it("troca válida → Bearer, sem expires_in nem refresh token", async () => {
    findClient.mockResolvedValue(CLIENTE);
    exchangeCode.mockResolvedValue(`${MCP_TOKEN_PREFIX}abc`);
    const r = await post(valido);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ access_token: `${MCP_TOKEN_PREFIX}abc`, token_type: "Bearer" });
  });
});

describe("6.5: cookies do cliente", () => {
  it("sessão assinada; adulterada ou com outro segredo → sem sessão", async () => {
    const t = await signClientSession("conta-1", SEGREDO);
    expect(await verifyClientSession(t, SEGREDO)).toBe("conta-1");
    expect(await verifyClientSession(t, "y".repeat(40))).toBeNull();
    expect(await verifyClientSession(`${t.slice(0, -2)}xx`, SEGREDO)).toBeNull();
    expect(await verifyClientSession(undefined, SEGREDO)).toBeNull();
  });
  it("login só volta para /oauth/autorizar (sem redirecionador aberto)", () => {
    expect(safeReturnPath("/oauth/autorizar?client_id=a&state=b*")).toBe("/oauth/autorizar?client_id=a&state=b*");
    expect(safeReturnPath("https://malicioso.test")).toBe("/oauth/entrar");
    expect(safeReturnPath("//malicioso.test")).toBe("/oauth/entrar");
    expect(safeReturnPath("/painel/chaves")).toBe("/oauth/entrar");
    expect(decodeLoginCookie(encodeLoginCookie({ state: "s", verifier: "v", volta: "https://x" }))).toEqual({ state: "s", verifier: "v", volta: "/oauth/entrar" });
    expect(decodeLoginCookie("lixo")).toBeNull();
  });
});

describe("6.5, passo 2: id_token do Google", () => {
  let jwks: ReturnType<typeof createLocalJWKSet>;
  let chave: CryptoKey;
  beforeAll(async () => {
    const par = await generateKeyPair("RS256");
    chave = par.privateKey as CryptoKey;
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: "k", alg: "RS256" }] });
    process.env.GOOGLE_CLIENT_ID = "cliente-teste";
  });
  const idToken = (claims: Record<string, unknown>, aud = "cliente-teste") =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k" }).setIssuer("https://accounts.google.com").setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(chave);
  it("válido → sub e e-mail minúsculo; sem e-mail verificado ou de outro app → erro", async () => {
    expect(await verifyIdToken(await idToken({ sub: "1", email: "A@Gmail.com", email_verified: true }), jwks)).toEqual({ sub: "1", email: "a@gmail.com" });
    await expect(verifyIdToken(await idToken({ sub: "1", email: "a@gmail.com", email_verified: false }), jwks)).rejects.toThrow("email_nao_verificado");
    await expect(verifyIdToken(await idToken({ sub: "1", email: "a@gmail.com", email_verified: true }, "outro-app"), jwks)).rejects.toThrow();
  });
});

describe("6.3 e 11.22: credencial do MCP", () => {
  const db = (rpc: unknown[], chave: unknown = null) => ({
    rpc: async () => ({ data: rpc, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: chave, error: null }) }) }) }),
  }) as never;
  it("token OAuth: válido, no limite e inválido; chave do painel continua valendo", async () => {
    expect(await verifyCredential(db([{ token_id: "t", permitido: true, espera_s: 0 }]), `${MCP_TOKEN_PREFIX}x`)).toEqual({ tipo: "token", id: "t", permitido: true, esperaS: 0 });
    expect(await verifyCredential(db([{ token_id: "t", permitido: false, espera_s: 30 }]), `${MCP_TOKEN_PREFIX}x`)).toMatchObject({ permitido: false, esperaS: 30 });
    expect(await verifyCredential(db([]), `${MCP_TOKEN_PREFIX}x`)).toBeNull();
    expect(await verifyCredential(db([], { id: "k", ativa: true }), "chave-do-painel")).toEqual({ tipo: "chave", id: "k" });
  });
  it("401 aponta os metadados do recurso; 429 com Retry-After e a mensagem da seção 15", async () => {
    expect(unauthorized().headers.get("WWW-Authenticate")).toContain('resource_metadata="https://fechouporquanto.com.br/.well-known/oauth-protected-resource"');
    const r = tooManyRequests(42);
    expect([r.status, r.headers.get("Retry-After")]).toEqual([429, "42"]);
    expect(await r.json()).toEqual({ erro: "Limite de uso atingido. Tente de novo em 42 segundos." });
    expect(limiteAtingido(3600)).toBe("Limite de uso atingido. Tente de novo em 60 minutos.");
  });
});
