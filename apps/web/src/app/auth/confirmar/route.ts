/**
 * GET /auth/confirmar (seção 6.1): destino do link de recuperação de senha do Supabase. Troca o
 * token_hash (ou o code do PKCE) por uma sessão e segue para ?proximo (só caminhos internos).
 * Recebe: a requisição com token_hash e type, ou code. Devolve: redirecionamento.
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/servidor";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const proximoBruto = p.get("proximo") ?? "/";
  // Só caminho interno: evita redirecionamento aberto para outro site.
  const proximo = proximoBruto.startsWith("/") && !proximoBruto.startsWith("//") ? proximoBruto : "/";
  const supabase = await createSessionClient();
  const tokenHash = p.get("token_hash");
  const tipo = p.get("type") as EmailOtpType | null;
  const codigo = p.get("code");
  const { error } = tokenHash && tipo
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
    : codigo ? await supabase.auth.exchangeCodeForSession(codigo) : { error: new Error("link inválido") };
  const destino = request.nextUrl.clone();
  destino.search = "";
  destino.pathname = error ? "/esqueci-senha" : proximo;
  return NextResponse.redirect(destino);
}
