/**
 * POST /oauth/token — seção 6.5, passo 5 (épico 8.10): troca o código pelo token, conferindo numa
 * transação código existente, não usado, não vencido, do mesmo cliente, mesmo redirect_uri e PKCE.
 * Aceita form-urlencoded (o padrão) ou JSON. Devolve: {access_token, token_type: "Bearer"}, sem
 * expires_in nem refresh token. Código reusado (que também revoga o token já emitido) → invalid_grant.
 */
import { PKCE_VERIFIER_MAX, PKCE_VERIFIER_MIN } from "@m2-real/ingestao/regras";
import { ERROS_OAUTH } from "@/server/oauth/mensagens";
import { exchangeCode, findClient, oauthError, oauthJson, preflight } from "@/server/oauth/server";

/** Lê os campos do corpo (form ou JSON). Corpo que não é objeto vira "sem campos". */
async function fields(req: Request): Promise<Record<string, string>> {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  }
  const form = await req.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
}

// RFC 7636: code_verifier com 43 a 128 caracteres do conjunto sem reserva.
const VERIFIER = new RegExp(`^[A-Za-z0-9\\-._~]{${PKCE_VERIFIER_MIN},${PKCE_VERIFIER_MAX}}$`);

export async function POST(req: Request) {
  const f = await fields(req);
  if (f.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", ERROS_OAUTH.grantType);
  if (!f.code || !f.client_id || !f.redirect_uri || !VERIFIER.test(f.code_verifier ?? "")) return oauthError("invalid_request", ERROS_OAUTH.faltando);
  try {
    if (!(await findClient(f.client_id))) return oauthError("invalid_client", ERROS_OAUTH.cliente, 401);
    const token = await exchangeCode(f.code, f.client_id, f.redirect_uri, f.code_verifier!);
    if (!token) return oauthError("invalid_grant", ERROS_OAUTH.grant);
    return oauthJson({ access_token: token, token_type: "Bearer" });
  } catch (e) {
    console.error((e as Error).message);
    return oauthError("server_error", ERROS_OAUTH.servidor, 500);
  }
}

export const OPTIONS = preflight;
