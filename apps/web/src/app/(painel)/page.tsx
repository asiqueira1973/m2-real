/**
 * [Admin] Visão geral (seção 10; critério 2 do 8.7): faixa com a última execução de cada rotina e
 * um card por bairro com vendas em 24 meses, % de cobertura (confirmada + calibrada; P4) e a
 * distribuição por selo — os números da última linha de m2_cobertura_bairros.
 */
import { COR_BARRA, SeloArea } from "@/components/selo";
import { EstadoVazio } from "@/components/estado-vazio";
import { ROTINAS_VISAO, loadOverview } from "@/features/visao-geral/dados";
import { dataHora, numero, percentual } from "@/lib/formato";
import { ROTULO_SELO, type Selo } from "@/lib/selos";

const STATUS: Record<string, string> = { concluida: "concluída", falhou: "falhou", em_andamento: "em andamento", substituida: "substituída" };
const ORDEM_BARRA: readonly Selo[] = ["confirmada", "calibrada", "indicativa", "estimada", "sem_dado"];

export default async function VisaoGeralPage() {
  const { cobertura, execucoes } = await loadOverview();
  const porRotina = new Map(execucoes.map((e) => [e.rotina, e]));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Visão geral</h1>

      <section aria-label="Últimas execuções" className="grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {ROTINAS_VISAO.map(({ rotina, rotulo }) => {
          const e = porRotina.get(rotina);
          return (
            <div key={rotina} className="bg-white px-4 py-3">
              <p className="text-xs text-muted-foreground">{rotulo}</p>
              <p className="text-sm">{e ? dataHora(e.concluida_em ?? e.iniciada_em) : "nunca executada"}</p>
              {e && <p className={`text-xs ${e.status === "falhou" ? "text-destructive" : "text-muted-foreground"}`}>{STATUS[e.status] ?? e.status}</p>}
            </div>
          );
        })}
      </section>

      {cobertura.length === 0 ? (
        <EstadoVazio mensagem="Nenhuma calibração concluída ainda." />
      ) : (
        <section aria-label="Cobertura por bairro" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cobertura.map((c) => {
            const contagens: Record<Selo, number> = {
              confirmada: c.vendas_confirmada, calibrada: c.vendas_calibrada, indicativa: c.vendas_indicativa,
              estimada: c.vendas_estimada, sem_dado: c.vendas_sem_dado,
            };
            return (
              <article key={c.bairro_id} className="rounded-xl border border-border p-5">
                <h2 className="text-base font-semibold">{c.bairro_nome}</h2>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{percentual(Number(c.pct_cobertura))}</p>
                <p className="text-xs text-muted-foreground">de cobertura · {numero(c.vendas_24m)} vendas em 24 meses</p>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted" role="img"
                  aria-label={ORDEM_BARRA.map((s) => `${ROTULO_SELO[s]}: ${contagens[s]}`).join(", ")}>
                  {c.vendas_24m > 0 && ORDEM_BARRA.map((s) => contagens[s] > 0 && (
                    <span key={s} className={COR_BARRA[s]} style={{ width: `${(contagens[s] / c.vendas_24m) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                  {ORDEM_BARRA.map((s) => (
                    <li key={s} className="flex items-center gap-1 text-xs">
                      <SeloArea selo={s} /> <span className="tabular-nums">{numero(contagens[s])}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-muted-foreground">Calculado em {dataHora(c.calculado_em)}</p>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
