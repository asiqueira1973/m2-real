"use client";
/**
 * "Confirmar área" (seção 10; critério 2 do 8.8): painel lateral com área privativa, vagas
 * inclusas e observação obrigatória — o botão fica desabilitado sem observação. Ao lado do
 * formulário, as evidências casadas (anúncios e editais, com área e link).
 * Recebe: a planta, o prédio e as evidências. Devolve: o botão e o painel.
 */
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmArea, type Resultado } from "@/features/revisao/acoes";
import { area } from "@/lib/formato";
import { canConfirm } from "@/lib/revisao";

export interface Evidencia {
  tipo: "Anúncio" | "Edital";
  area: number | null;
  dominio: string;
  url: string;
}

export function ConfirmarArea({ plantaId, predioId, areaIptu, areaAtual, vagasAtuais, evidencias }: {
  plantaId: string; predioId: string; areaIptu: number; areaAtual: number | null; vagasAtuais: number | null; evidencias: readonly Evidencia[];
}) {
  const [aberto, setAberto] = useState(false);
  const [areaTexto, setAreaTexto] = useState(areaAtual === null ? "" : String(areaAtual));
  const [observacao, setObservacao] = useState("");
  const [estado, enviar, pendente] = useActionState<Resultado, FormData>(confirmArea, {});
  useEffect(() => { if (estado.ok) setAberto(false); }, [estado]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Confirmar área</Button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 whitespace-normal" onClick={() => setAberto(false)}>
          <aside role="dialog" aria-modal="true" aria-label="Confirmar área da planta"
            className="flex h-full w-[640px] max-w-full gap-6 overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <form action={enviar} className="flex w-64 shrink-0 flex-col gap-4">
              <h2 className="text-base font-semibold">Confirmar área</h2>
              <p className="text-xs text-muted-foreground">Planta de {area(areaIptu)} (IPTU). A confirmação vale como selo Confirmada · revisão e o pipeline não a altera mais (regra 11.11).</p>
              <input type="hidden" name="planta" value={plantaId} />
              <input type="hidden" name="predio" value={predioId} />
              <div className="space-y-1.5">
                <Label htmlFor="area">Área privativa (m²)</Label>
                <Input id="area" name="area" inputMode="decimal" value={areaTexto} onChange={(e) => setAreaTexto(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vagas">Vagas inclusas</Label>
                <Input id="vagas" name="vagas" inputMode="numeric" defaultValue={vagasAtuais ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="observacao">Observação (obrigatória)</Label>
                <textarea id="observacao" name="observacao" rows={4} value={observacao} onChange={(e) => setObservacao(e.target.value)}
                  className="w-full rounded-lg border border-input px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
              </div>
              {estado.erro && <p role="alert" className="text-sm text-destructive">{estado.erro}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={!canConfirm(areaTexto, observacao) || pendente}>{pendente ? "Salvando…" : "Confirmar"}</Button>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
              </div>
            </form>
            <section className="min-w-0 flex-1 border-l border-border pl-6">
              <h3 className="text-sm font-semibold">Evidências</h3>
              {evidencias.length === 0 ? <p className="mt-2 text-sm break-words text-muted-foreground">Nenhum anúncio ou edital casado com esta planta.</p> : (
                <ul className="mt-2 space-y-2 text-sm">
                  {evidencias.map((e) => (
                    <li key={e.url} className="flex justify-between gap-2">
                      <span>{e.tipo} · {e.dominio}</span>
                      <span className="tabular-nums">{area(e.area)}</span>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Abrir</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
