/**
 * [Admin] Execuções (seção 10; critério 4 do 8.8): saúde e "Executar agora" por rotina (O4) e as
 * últimas 50 execuções com status, contagens, duração e erro. Filtros: rotina e status.
 */
import Link from "next/link";
import { ROTINAS } from "@m2-real/ingestao/regras";
import { EstadoVazio } from "@/components/estado-vazio";
import { ExecutarAgora } from "@/components/executar-agora";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadExecutions } from "@/features/operacao/dados";
import { duration } from "@/lib/duracao";
import { dataHora, numero } from "@/lib/formato";

const campo = "h-8 rounded-lg border border-input bg-white px-2 text-sm";
const STATUS: Record<string, string> = { concluida: "concluída", falhou: "falhou", em_andamento: "em andamento", substituida: "substituída" };
const SAUDE: Record<string, { texto: string; cor: string }> = {
  ok: { texto: "Saudável", cor: "text-foreground" },
  atrasada: { texto: "Atrasada", cor: "text-destructive" },
  falhou: { texto: "Falhou", cor: "text-destructive" },
  travada: { texto: "Travada", cor: "text-destructive" },
  volume_anomalo: { texto: "Volume anômalo", cor: "text-destructive" },
  nunca_executada: { texto: "Nunca executada", cor: "text-muted-foreground" },
};

export default async function ExecucoesPage({ searchParams }: { searchParams: Promise<{ rotina?: string; status?: string }> }) {
  const sp = await searchParams;
  const rotina = (ROTINAS as readonly string[]).includes(sp.rotina ?? "") ? sp.rotina! : null;
  const status = sp.status && sp.status in STATUS ? sp.status : null;
  const { execucoes, saude } = await loadExecutions(rotina, status);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Execuções</h1>
      <section aria-label="Saúde das rotinas" className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
        {saude.rotinas.map((r) => (
          <div key={r.rotina} className="space-y-1 bg-white px-4 py-3">
            <p className="text-xs text-muted-foreground">{r.rotina}</p>
            <p className={`text-sm font-medium ${SAUDE[r.estado]?.cor ?? ""}`}>{SAUDE[r.estado]?.texto ?? r.estado}</p>
            {r.motivo && <p className="text-xs text-muted-foreground">{r.motivo}</p>}
            <ExecutarAgora rotina={r.rotina} />
          </div>
        ))}
      </section>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Rotina
          <select name="rotina" defaultValue={rotina ?? ""} className={campo}>
            <option value="">Todas</option>
            {ROTINAS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Status
          <select name="status" defaultValue={status ?? ""} className={campo}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm">Filtrar</Button>
        <Link href="/painel/execucoes" className="text-sm text-primary hover:underline">Limpar</Link>
      </form>

      {execucoes.length === 0 ? <EstadoVazio mensagem="Nenhuma execução com esses filtros." /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Início</TableHead><TableHead>Rotina</TableHead><TableHead>Referência</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Lidas</TableHead><TableHead className="text-right">Gravadas</TableHead><TableHead className="text-right">Descartadas</TableHead>
            <TableHead className="text-right">Duração</TableHead><TableHead>Erro</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {execucoes.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="tabular-nums">{dataHora(e.iniciada_em)}</TableCell>
                <TableCell>{e.rotina}</TableCell>
                <TableCell>{e.referencia ?? "—"}</TableCell>
                <TableCell className={e.status === "falhou" ? "text-destructive" : ""}>{STATUS[e.status] ?? e.status}</TableCell>
                <TableCell className="text-right tabular-nums">{numero(e.linhas_lidas)}</TableCell>
                <TableCell className="text-right tabular-nums">{numero(e.linhas_gravadas)}</TableCell>
                <TableCell className="text-right tabular-nums">{numero(e.linhas_descartadas)}</TableCell>
                <TableCell className="text-right tabular-nums">{duration(e.iniciada_em, e.concluida_em)}</TableCell>
                <TableCell className="max-w-72 truncate text-xs" title={e.mensagem_erro ?? undefined}>{e.mensagem_erro ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
