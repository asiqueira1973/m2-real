/**
 * POST /api/clientes/[id]/bloquear — corpo {bloquear: boolean} (seção 5; épico 8.10).
 * Valida: sessão de admin e id UUID. Faz: m2_bloqueia_cliente com a sessão (a função confere
 * m2_eh_admin()). Bloqueada, a conta não entra e seus tokens param na hora.
 * Devolve: 204, 400, 401/403, 404 (id inválido) ou 500.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/sessao";
import { isUuid } from "@/lib/uuid";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireAdmin();
  if (!sessao.ok) return NextResponse.json({ erro: sessao.erro }, { status: sessao.status });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  const corpo: unknown = await req.json().catch(() => null);
  const bloquear = (corpo as { bloquear?: unknown } | null)?.bloquear;
  if (typeof bloquear !== "boolean") return NextResponse.json({ erro: "Envie {bloquear: true|false}." }, { status: 400 });
  const { error } = await sessao.supabase.rpc("m2_bloqueia_cliente", { p_cliente_id: id, p_bloquear: bloquear });
  if (error) {
    console.error(error);
    return NextResponse.json({ erro: "Não foi possível alterar a conta." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
