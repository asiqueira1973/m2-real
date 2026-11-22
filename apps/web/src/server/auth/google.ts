/**
 * Login do cliente MCP com Google (seção 6.5, passo 2; épico 8.10). Só escopos básicos (openid
 * email): não sensíveis, sem verificação do Google, sem refresh token. PKCE S256 além do state.
 * Monta a URL de consentimento, troca o código e valida o id_token. SÓ SERVIDOR.
 */
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_TOKEN_TIMEOUT_MS } from "@m2-real/ingestao/regras";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { siteOrigin } from "@/server/oauth/server";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Endereço de retorno registrado no Google Cloud (README). */
export function googleRedirectUri(): string {
  return `${siteOrigin()}/api/auth/google/callback`;
}

/** Lê o Client ID. Lança erro se faltar a variável. */
function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID ausente");
  return id;
}

/** Par PKCE (RFC 7636). Devolve: verifier (fica no cookie) e challenge S256 (vai ao Google). */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** URL de consentimento do Google. Recebe: state e challenge. Devolve: a URL. */
export function buildGoogleAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email",
    prompt: "select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/** Troca o código do Google pelo id_token. Lança erro se o Google recusar ou demorar mais de 5 s. */
export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(GOOGLE_TOKEN_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`google_token_${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("google_sem_id_token");
  return body.id_token;
}

export type GoogleIdentity = { sub: string; email: string };

let remoteJwks: JWTVerifyGetKey | null = null;

/**
 * Valida o id_token (assinatura, aud, iss, exp e email_verified). Recebe: o id_token e, nos testes,
 * um conjunto de chaves local. Devolve: sub e e-mail (minúsculo). Lança erro se inválido.
 */
export async function verifyIdToken(idToken: string, jwks?: JWTVerifyGetKey): Promise<GoogleIdentity> {
  remoteJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  const { payload } = await jwtVerify(idToken, jwks ?? remoteJwks, {
    audience: clientId(),
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("id_token_incompleto");
  if (payload.email_verified !== true) throw new Error("email_nao_verificado");
  return { sub: payload.sub, email: payload.email.toLowerCase() };
}
