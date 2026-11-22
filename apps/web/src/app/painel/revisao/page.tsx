/**
 * [Admin] Fila de revisão (seção 10; critério 1 do 8.8): plantas e vendas pendentes, agrupadas por
 * motivo e ordenadas pelo volume de vendas do prédio, com as evidências resumidas. Filtros: bairro e
 * motivo. O botão abre a ficha na aba certa.
 */
import Link from "next/link";
import { EstadoVazio } from "@/components/estado-vazio";
import { SeloArea } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { ITENS_POR_GRUPO, loadQueue } from "@/features/revisao/dados";
import { numero } from "@/lib/formato";
import { evidenceSummary, groupByReason, tabFor } from "@/lib/revisao";
import { label, ROTULO_MOTIVO } from "@/lib/rotulos";
import { parseSelo } from "@/lib/selos";

const campo = "h-8 rounded-lg border border-input bg-white px-2 text-sm";

export default async function RevisaoPage({ searchParams }: { searchParams: Promise<{ bairro?: string; motivo?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const bairro = Number(sp.bairro) > 0 ? Number(sp.bairro) : null;
  const motivo = sp.motivo && sp.motivo in ROTULO_MOTIVO ? sp.motivo : null;
  const pagina = Number(sp.pagina) > 1 ? Number(sp.pagina) : 1;
  const { bairros, itens } = await loadQueue(bairro, motivo, pagina);
  const grupos = groupByReason(itens);
  const link = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams();
    if (bairro) q.set("bairro", String(bairro));
    for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
    return `/painel/revisao?${q}`;
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Fila de revisão</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Bairro
          <select name="bairro" defaultValue={bairro ?? ""} className={campo}>
            <option value="">Todos</option>
            {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Motivo
          <select name="motivo" defaultValue={motivo ?? ""} className={campo}>
            <option value="">Todos</option>
            {Object.entries(ROTULO_MOTIVO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm">Filtrar</Button>
        <Link href="/painel/revisao" className="text-sm text-primary hover:underline">Limpar</Link>
      </form>

      {grupos.length === 0 ? <EstadoVazio mensagem="Nada para revisar agora." /> : grupos.map((g) => {
        const paginas = Math.ceil(g.total / ITENS_POR_GRUPO);
        return (
          <section key={g.motivo} className="space-y-2">
            <h2 className="text-base font-semibold">{label(ROTULO_MOTIVO, g.motivo)} <span className="font-normal text-muted-foreground">({numero(g.total)})</span></h2>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {g.itens.map((i) => (
                <li key={i.item_id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{i.logradouro}{i.numero ? `, ${i.numero}` : ""} <span className="font-normal text-muted-foreground">· {i.bairro_nome} · {numero(i.vendas_janela)} vendas em 24 meses</span></p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><SeloArea selo={parseSelo(i.selo)} /> {evidenceSummary({ ...i, areas_anuncios: i.areas_anuncios?.map(Number) ?? null, areas_editais: i.areas_editais?.map(Number) ?? null })}</p>
                  </div>
                  <Link href={`/painel/predios/${i.predio_id}?aba=${tabFor(i.tipo)}${i.tipo === "venda" ? "&meses=todas" : ""}`} className="shrink-0 text-primary hover:underline">Abrir ficha</Link>
                </li>
              ))}
            </ul>
            {motivo ? (
              <nav aria-label="Paginação" className="flex justify-between text-sm">
                <span className="text-muted-foreground">Página {pagina} de {paginas}</span>
                <span className="flex gap-3">
                  {pagina > 1 && <Link href={link({ motivo: g.motivo, pagina: pagina - 1 })} className="text-primary hover:underline">Anterior</Link>}
                  {pagina < paginas && <Link href={link({ motivo: g.motivo, pagina: pagina + 1 })} className="text-primary hover:underline">Próxima</Link>}
                </span>
              </nav>
            ) : g.total > g.itens.length && (
              <Link href={link({ motivo: g.motivo })} className="text-sm text-primary hover:underline">Ver todos os {numero(g.total)}</Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
