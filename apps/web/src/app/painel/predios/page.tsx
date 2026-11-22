/**
 * [Admin] Prédios (seção 10; critério 3 do 8.7): tabela com endereço, bairro, ano, unidades,
 * plantas, pior selo, vendas em 24 meses e revisão pendente. Filtros por bairro, selo, "só com
 * revisão pendente" e busca por endereço, todos na URL (formulário GET, funciona sem JavaScript).
 */
import Link from "next/link";
import { EstadoVazio } from "@/components/estado-vazio";
import { SeloArea } from "@/components/selo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadBuildings } from "@/features/predios/dados";
import { pageHref, parsePrediosFilters, TAMANHO_PAGINA } from "@/lib/filtros";
import { numero } from "@/lib/formato";
import { ROTULO_SELO, SELOS } from "@/lib/selos";

const campo = "h-8 rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary";

export default async function PrediosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parsePrediosFilters(await searchParams);
  const { bairros, linhas, total } = await loadBuildings(f);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Prédios</h1>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Endereço
          <Input name="busca" defaultValue={f.busca} placeholder="Ex.: Joaquim Antunes, 577" className="h-8 w-72" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Bairro
          <select name="bairro" defaultValue={f.bairro ?? ""} className={campo}>
            <option value="">Todos</option>
            {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Selo (pior planta)
          <select name="selo" defaultValue={f.selo ?? ""} className={campo}>
            <option value="">Todos</option>
            {SELOS.map((s) => <option key={s} value={s}>{ROTULO_SELO[s]}</option>)}
          </select>
        </label>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input type="checkbox" name="revisao" value="1" defaultChecked={f.soRevisao} className="size-4 accent-primary" />
          Só com revisão pendente
        </label>
        <Button type="submit" size="sm">Filtrar</Button>
        <Link href="/painel/predios" className="text-sm text-primary hover:underline">Limpar</Link>
      </form>

      {linhas.length === 0 ? (
        <EstadoVazio mensagem="Nenhum prédio com esses filtros." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{numero(total)} prédios</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endereço</TableHead><TableHead>Bairro</TableHead><TableHead className="text-right">Ano</TableHead>
                <TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Plantas</TableHead>
                <TableHead>Pior selo</TableHead><TableHead className="text-right">Vendas 24m</TableHead><TableHead>Revisão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((p) => (
                <TableRow key={p.id} className="relative">
                  <TableCell>
                    <Link href={`/painel/predios/${p.id}`} className="font-medium after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-primary">
                      {p.logradouro}{p.numero ? `, ${p.numero}` : ""}
                    </Link>
                  </TableCell>
                  <TableCell>{p.bairro_nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.ano_construcao ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{numero(p.total_unidades)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numero(p.qtd_plantas)}</TableCell>
                  <TableCell><SeloArea selo={p.pior_selo} /></TableCell>
                  <TableCell className="text-right tabular-nums">{numero(p.vendas_janela)}</TableCell>
                  <TableCell>{p.revisao_pendente ? <span className="text-xs font-medium text-primary">Pendente</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Página {f.pagina} de {paginas}</span>
            <span className="flex gap-3">
              {f.pagina > 1 && <Link href={pageHref(f, f.pagina - 1)} className="text-primary hover:underline">Anterior</Link>}
              {f.pagina < paginas && <Link href={pageHref(f, f.pagina + 1)} className="text-primary hover:underline">Próxima</Link>}
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
