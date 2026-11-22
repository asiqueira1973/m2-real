/**
 * Cookies do cliente MCP (seção 6.5; épico 8.10). SÓ SERVIDOR.
 * - Sessão: JWT HS256 assinado com SESSION_SECRET, com o id da conta (m2_clientes). Vale só nas
 *   telas do OAuth; o painel continua com a sessão do Supabase Auth (6.1).
 * - Login com Google: state, verifier do PKCE e a rota de volta, por 10 min, só em /api/auth/google.
 */
import { LOGIN_GOOGLE_COOKIE_SEGUNDOS, SESSAO_CLIENTE_DIAS } from "@m2-real/ingestao/regras";
import { SignJWT, jwtVerify } from "jose";

export const SESSAO_CLIENTE_COOKIE = "m2_cliente";
export const LOGIN_GOOGLE_COOKIE = "m2_login_google";
export const LOGIN_GOOGLE_COOKIE_PATH = "/api/auth/google";
const SESSAO_S = SESSAO_CLIENTE_DIAS * 24 * 60 * 60;

/** Converte o segredo em chave. Recebe: valor opcional (testes). Lança erro se ausente ou curto. */
function secretKey(raw = process.env.SESSION_SECRET): Uint8Array {
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mín. 32 caracteres)");
  return new TextEncoder().encode(raw);
}

/** Assina a sessão de uma conta. Recebe: id da conta. Devolve: o JWT do cookie. */
export async function signClientSession(clienteId: string, rawSecret?: string): Promise<string> {
  return new SignJWT({ cliente_id: clienteId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSAO_S}s`).sign(secretKey(rawSecret));
}

/** Confere assinatura e validade. Recebe: o JWT. Devolve: o id da conta, ou nulo se inválido. */
export async function verifyClientSession(token: string | undefined, rawSecret?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(rawSecret), { algorithms: ["HS256"] });
    return typeof payload.cliente_id === "string" ? payload.cliente_id : null;
  } catch {
    return null;
  }
}

/** Opções do cookie de sessão: HttpOnly, Secure fora do localhost, SameSite=Lax. */
export function clientSessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSAO_S };
}

/** Opções do cookie do login com Google. */
export function loginCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: LOGIN_GOOGLE_COOKIE_PATH, maxAge: LOGIN_GOOGLE_COOKIE_SEGUNDOS };
}

export type LoginCookie = { state: string; verifier: string; volta: string };

// O login só volta para a autorização do MCP; qualquer outra coisa vira a raiz (sem redirecionador
// aberto). O "*" entra porque o URLSearchParams não o codifica.
const VOLTA_SEGURA = /^\/oauth\/autorizar(\?[A-Za-z0-9\-._~%&=+*]*)?$/;

/** Saneia a rota de volta. Recebe: o ?volta=. Devolve: rota segura. */
export function safeReturnPath(raw: string | null | undefined): string {
  return raw && VOLTA_SEGURA.test(raw) ? raw : "/oauth/entrar";
}

/** Serializa o cookie do login. */
export function encodeLoginCookie(v: LoginCookie): string {
  return Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
}

/** Lê o cookie do login. Devolve: o conteúdo ou nulo se ausente ou malformado. */
export function decodeLoginCookie(raw: string | undefined): LoginCookie | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<LoginCookie>;
    if (typeof v.state !== "string" || typeof v.verifier !== "string" || typeof v.volta !== "string") return null;
    return { state: v.state, verifier: v.verifier, volta: safeReturnPath(v.volta) };
  } catch {
    return null;
  }
}
