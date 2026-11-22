/**
 * GET /api/auth/google — início do login do cliente MCP com Google (seção 6.5, passo 2; 8.10).
 * Gera state e PKCE, guarda os dois e a rota de volta (?volta=, saneada) num cookie curto HttpOnly e
 * redireciona ao Google. Sem as variáveis do Google, volta para /oauth/entrar com erro.
 */
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl, createPkce } from "@/server/auth/google";
import { LOGIN_GOOGLE_COOKIE, encodeLoginCookie, loginCookieOptions, safeReturnPath } from "@/server/auth/sessao-cliente";
import { siteOrigin } from "@/server/oauth/server";

export async function GET(req: NextRequest) {
  const volta = safeReturnPath(req.nextUrl.searchParams.get("volta"));
  try {
    const state = randomBytes(24).toString("base64url");
    const { verifier, challenge } = createPkce();
    const res = NextResponse.redirect(buildGoogleAuthUrl(state, challenge), 302);
    res.cookies.set(LOGIN_GOOGLE_COOKIE, encodeLoginCookie({ state, verifier, volta }), loginCookieOptions());
    return res;
  } catch (e) {
    console.error((e as Error).message);
    return NextResponse.redirect(`${siteOrigin()}/oauth/entrar?erro=falha&volta=${encodeURIComponent(volta)}`, 302);
  }
}
