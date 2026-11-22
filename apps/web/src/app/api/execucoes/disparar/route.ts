/**
 * POST /api/execucoes/disparar {rotina} (seção 13.1; critério 4 do 8.8).
 * Valida: sessão de admin; rotina na lista da 4.4. Faz: workflow_dispatch no GitHub (servidor).
 * Devolve: 204 se o GitHub aceitou; 400 rotina inválida; 401/403 sem acesso; 502 se o GitHub recusar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/sessao";
import { dispatchWorkflow, parseRotina } from "@/server/github";

export async function POST(request: NextRequest) {
  const sessao = await requireAdmin();
  if (!sessao.ok) return NextResponse.json({ erro: sessao.erro }, { status: sessao.status });
  const corpo = await request.json().catch(() => null);
  const rotina = parseRotina(corpo?.rotina);
  if (!rotina) return NextResponse.json({ erro: "Rotina inválida." }, { status: 400 });
  try {
    await dispatchWorkflow(rotina);
  } catch (erro) {
    console.error(erro);
    return NextResponse.json({ erro: (erro as Error).message }, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
