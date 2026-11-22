/**
 * POST /api/chaves/[id]/revogar (seção 13.1; critério 5 do 8.8).
 * Valida: sessão de admin. Faz: ativa = false (update com a sessão; RLS m2_chaves_api_atualizacao_admin,
 * grant só na coluna ativa). Devolve: 204, 401/403, 404 (chave inexistente) ou 500.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/sessao";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireAdmin();
  if (!sessao.ok) return NextResponse.json({ erro: sessao.erro }, { status: sessao.status });
  const { id } = await params;
  const { data, error } = await sessao.supabase.from("m2_chaves_api").update({ ativa: false }).eq("id", id).select("id");
  if (error) {
    console.error(error);
    return NextResponse.json({ erro: "Não foi possível revogar a chave." }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ erro: "Chave não encontrada." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
