/**
 * GET /api/auth/google/callback — retorno do Google (seção 6.5, passo 2; regra 11.21; 8.10).
 * 1) confere o state; 2) troca o código (PKCE) e valida o id_token com email_verified; 3) entra ou
 * cria a conta (limite diário de contas novas; bloqueada não entra); 4) abre a sessão e volta para a
 * autorização. Conta nova gera o evento de primeira conexão (seção 21). Erros voltam para
 * /oauth/entrar?erro=falha|pausado|bloqueada.
 * Nunca registra e-mail nem token em log (seção 20).
 */
import { NextResponse, type NextRequest } from "next/server";
import { exchangeGoogleCode, verifyIdToken } from "@/server/auth/google";
import {
  LOGIN_GOOGLE_COOKIE, LOGIN_GOOGLE_COOKIE_PATH, SESSAO_CLIENTE_COOKIE, clientSessionCookieOptions, decodeLoginCookie, signClientSession,
} from "@/server/auth/sessao-cliente";
import { track } from "@/server/eventos/visao";
import { enterClient } from "@/server/oauth/contas";
import type { ErroLogin } from "@/server/oauth/mensagens";
import { siteOrigin } from "@/server/oauth/server";

/** Volta para /oauth/entrar com o erro (mantendo a volta) e apaga o cookie do login. */
function fail(erro: ErroLogin, volta?: string) {
  const q = new URLSearchParams({ erro, ...(volta ? { volta } : {}) });
  const res = NextResponse.redirect(`${siteOrigin()}/oauth/entrar?${q}`, 302);
  res.cookies.delete({ name: LOGIN_GOOGLE_COOKIE, path: LOGIN_GOOGLE_COOKIE_PATH });
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const salvo = decodeLoginCookie(req.cookies.get(LOGIN_GOOGLE_COOKIE)?.value);
  if (!code || !state || !salvo || state !== salvo.state) return fail("falha", salvo?.volta);
  try {
    const identidade = await verifyIdToken(await exchangeGoogleCode(code, salvo.verifier));
    const { clienteId, situacao } = await enterClient(identidade.sub, identidade.email);
    if (situacao === "pausado" || !clienteId) return fail("pausado", salvo.volta);
    if (situacao === "bloqueada") return fail("bloqueada", salvo.volta);
    // Seção 21: primeira conexão da pessoa (só na conta nova; a chave deduplica no ingest).
    if (situacao === "nova") track("fechou_por_quanto_primeira_conexao", async () => ({ quem: identidade.email, propriedades: {} }), clienteId);
    const res = NextResponse.redirect(`${siteOrigin()}${salvo.volta}`, 302);
    res.cookies.set(SESSAO_CLIENTE_COOKIE, await signClientSession(clienteId), clientSessionCookieOptions());
    res.cookies.delete({ name: LOGIN_GOOGLE_COOKIE, path: LOGIN_GOOGLE_COOKIE_PATH });
    return res;
  } catch (e) {
    console.error("login_google_falhou", e instanceof Error ? e.message : "erro");
    return fail("falha", salvo.volta);
  }
}
