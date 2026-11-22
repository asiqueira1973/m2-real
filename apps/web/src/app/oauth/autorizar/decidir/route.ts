/**
 * POST /oauth/autorizar/decidir — decisão da tela de consentimento (seção 6.5, passo 4; 8.10).
 * Exige sessão de cliente e Origin do próprio site. Confere o pedido de novo (o formulário pode ter
 * sido mexido). "Permitir" grava o código (10 min, PKCE) e volta com ?code&state; "Cancelar" volta
 * com ?error=access_denied&state. Sem sessão, origem estranha ou pedido inválido → 400/403, sem
 * redirecionar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AUTHORIZE_PARAMS, checkAuthorizeParams, withParams } from "@/server/oauth/authorize";
import { currentClient } from "@/server/oauth/contas";
import { createAuthorizationCode, siteOrigin } from "@/server/oauth/server";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== siteOrigin()) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const conta = await currentClient();
  if (!conta) return Response.json({ error: "login_required" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const p: Record<string, string | undefined> = {};
  for (const k of [...AUTHORIZE_PARAMS, "decisao"]) {
    const v = form?.get(k);
    p[k] = typeof v === "string" ? v : undefined;
  }
  const check = await checkAuthorizeParams(p);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  const { client, redirectUri, codeChallenge, state } = check.req;
  if (p.decisao !== "permitir") {
    return NextResponse.redirect(withParams(redirectUri, { error: "access_denied", ...(state ? { state } : {}) }), 303);
  }
  try {
    const code = await createAuthorizationCode(client, conta.id, redirectUri, codeChallenge);
    return NextResponse.redirect(withParams(redirectUri, { code, ...(state ? { state } : {}) }), 303);
  } catch (e) {
    const erro = (e as Error).message;
    return Response.json({ error: erro }, { status: erro === "server_error" ? 500 : 400 });
  }
}
