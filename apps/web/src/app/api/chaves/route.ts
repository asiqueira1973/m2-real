/**
 * POST /api/chaves {nome} (seção 13.1; 6.3; critério 5 do 8.8).
 * Valida: sessão de admin; nome com 3–60 caracteres. Faz: gera 32 bytes em base64url e grava só o
 * hash SHA-256 e o prefixo (insert com a sessão; RLS m2_chaves_api_insercao_admin).
 * Devolve: 201 com a chave (a única vez em que ela aparece), 400, 401/403 ou 500.
 */
import { NextResponse, type NextRequest } from "next/server";
import { generateKey, validKeyName } from "@/lib/chaves";
import { requireAdmin } from "@/lib/sessao";

export async function POST(request: NextRequest) {
  const sessao = await requireAdmin();
  if (!sessao.ok) return NextResponse.json({ erro: sessao.erro }, { status: sessao.status });
  const corpo = await request.json().catch(() => null);
  const nome = validKeyName(corpo?.nome);
  if (!nome) return NextResponse.json({ erro: "O nome precisa ter de 3 a 60 caracteres." }, { status: 400 });
  const { chave, hash, prefixo } = generateKey();
  const { error } = await sessao.supabase.from("m2_chaves_api").insert({ nome, prefixo, hash_chave: hash, criada_por: sessao.usuario.id });
  if (error) {
    console.error(error);
    return NextResponse.json({ erro: "Não foi possível criar a chave." }, { status: 500 });
  }
  return NextResponse.json({ chave, prefixo }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
