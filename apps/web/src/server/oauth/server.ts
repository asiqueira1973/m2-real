/**
 * Servidor de autorização OAuth 2.1 do MCP (seções 6.3 e 6.5; épico 8.10). Mesmo desenho do Assina:
 * metadados (RFC 8414 e 9728), registro de cliente público (RFC 7591), código de autorização com
 * PKCE S256 e troca pelo token `fpq_mcp_…`. Só o hash do token fica no banco; ele vale até ser
 * revogado ou a conta ser bloqueada, sem expires_in nem refresh token.
 * Os endereços vêm sempre de NEXT_PUBLIC_SITE_URL, nunca do Host da requisição (6.5). SÓ SERVIDOR.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@m2-real/db/server";
import { OAUTH_CLIENTE_NOME_MAX, OAUTH_CODIGO_SEGUNDOS, OAUTH_REDIRECT_URIS_MAX, OAUTH_REDIRECT_URI_MAX } from "@m2-real/ingestao/regras";
import { hashKey } from "@/lib/chaves";

/** 6.3: prefixo dos tokens OAuth (distingue do formato das chaves do painel). */
export const MCP_TOKEN_PREFIX = "fpq_mcp_";

/** Origem pública do site (emissor e recurso). Recebe: nada. Devolve: a URL sem barra final. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}
/** Recurso protegido: o MCP em /mcp (decisão do 8.9). */
export const mcpResource = () => `${siteOrigin()}/mcp`;
/** RFC 9728: onde o cliente lê os metadados do recurso (vai no WWW-Authenticate do 401). */
export const resourceMetadataUrl = () => `${siteOrigin()}/.well-known/oauth-protected-resource`;

/** S256 do PKCE (RFC 7636). Recebe: o code_verifier. Devolve: base64url do SHA-256. */
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * 6.5, passo 3: diz se um redirect_uri pode ser registrado. https, ou http só em localhost e
 * 127.0.0.1 (cliente de desktop); sem fragmento e sem credenciais.
 */
export function acceptableRedirectUri(uri: string): boolean {
  if (uri.length > OAUTH_REDIRECT_URI_MAX) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

/** Cabeçalhos CORS do fluxo (clientes de navegador também usam). */
export function corsHeaders(): Record<string, string> {
  return CORS;
}

/** Resposta JSON do fluxo OAuth, sem cache e com CORS. */
export function oauthJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
}

/** Erro no formato do OAuth 2.1 ({error, error_description}). */
export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

/** Resposta do OPTIONS (pré-voo do CORS). */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export type OAuthClient = { id: string; nome: string; redirect_uris: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** RFC 7591: registra um cliente. Recebe: nome e redirect_uris já conferidos. Devolve: o cliente. */
export async function registerClient(nome: string, uris: string[]): Promise<OAuthClient> {
  const { data, error } = await createServiceClient()
    .from("m2_oauth_clientes")
    .insert({ nome: nome.slice(0, OAUTH_CLIENTE_NOME_MAX), redirect_uris: uris.slice(0, OAUTH_REDIRECT_URIS_MAX) })
    .select("id, nome, redirect_uris")
    .single();
  if (error) throw new Error(`Falha ao registrar cliente OAuth: ${error.message}`);
  return data;
}

/** Busca um cliente pelo client_id. Devolve: o cliente ou nulo (id malformado também é nulo). */
export async function findClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId || !UUID.test(clientId)) return null;
  const { data, error } = await createServiceClient().from("m2_oauth_clientes").select("id, nome, redirect_uris").eq("id", clientId).maybeSingle();
  if (error) throw new Error(`Falha ao ler cliente OAuth: ${error.message}`);
  return data;
}

/**
 * "Permitir" (6.5, passo 4): grava o código (só o hash) e devolve o valor em claro, que vai só no
 * redirect. Recebe: cliente OAuth, conta, redirect_uri e code_challenge. Lança o código do erro.
 */
export async function createAuthorizationCode(client: OAuthClient, clienteId: string, redirectUri: string, codeChallenge: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const { error } = await createServiceClient().rpc("m2_cria_codigo_oauth", {
    p_codigo_hash: hashKey(code),
    p_oauth_cliente_id: client.id,
    p_cliente_id: clienteId,
    p_redirect_uri: redirectUri,
    p_code_challenge: codeChallenge,
    p_validade_s: OAUTH_CODIGO_SEGUNDOS,
  });
  if (error) throw new Error(["invalid_request", "invalid_client", "access_denied"].includes(error.message) ? error.message : "server_error");
  return code;
}

/**
 * Troca do código pelo token (6.5, passo 5). Recebe: código, client_id, redirect_uri e verifier.
 * Devolve: o token em claro, ou nulo (invalid_grant).
 */
export async function exchangeCode(code: string, clientId: string, redirectUri: string, verifier: string): Promise<string | null> {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const { data, error } = await createServiceClient().rpc("m2_troca_codigo_oauth", {
    p_codigo_hash: hashKey(code),
    p_oauth_cliente_id: clientId,
    p_redirect_uri: redirectUri,
    p_challenge_do_verifier: s256(verifier),
    p_token_hash: hashKey(token),
    p_token_prefixo: token.slice(0, MCP_TOKEN_PREFIX.length + 8),
  });
  if (error) throw new Error(`Falha na troca do código: ${error.message}`);
  return data ? token : null;
}
