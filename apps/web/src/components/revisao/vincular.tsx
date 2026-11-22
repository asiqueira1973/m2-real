"use client";
/**
 * "Vincular" uma evidência sem vínculo (seção 10, Evidências sem vínculo; critério 3 do 8.8):
 * busca o prédio por endereço (regra 11.5) e escolhe a planta (anúncio) ou a unidade (edital).
 * Recebe: o tipo, o id da evidência e o endereço extraído (sugestão de busca). Devolve: o fluxo.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildingOptions, matchAd, matchEdital, searchBuildings } from "@/features/revisao/acoes";
import { area } from "@/lib/formato";

type Predio = { predio_id: string; endereco: string; bairro: string };

export function Vincular({ tipo, id, sugestao }: { tipo: "anuncio" | "edital"; id: string; sugestao: string }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(sugestao);
  const [predios, setPredios] = useState<Predio[] | null>(null);
  const [predio, setPredio] = useState<Predio | null>(null);
  const [opcoes, setOpcoes] = useState<{ id: string; rotulo: string }[]>([]);
  const [escolha, setEscolha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!aberto) return <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAberto(true)}>Vincular</button>;
  return (
    <div className="mt-2 w-80 space-y-2 rounded-lg border border-border p-3 text-xs">
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); iniciar(async () => {
        const r = await searchBuildings(busca); setErro(r.erro ?? null); setPredios(r.predios as Predio[]); setPredio(null);
      }); }}>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Endereço do prédio" className="h-7 text-xs" />
        <Button size="sm" type="submit" disabled={pendente}>Buscar</Button>
      </form>
      {predios && !predio && (predios.length === 0 ? <p className="text-muted-foreground">Nenhum prédio achado.</p> : (
        <ul className="space-y-1">{predios.map((p) => (
          <li key={p.predio_id}><button type="button" className="text-left text-primary hover:underline" onClick={() => iniciar(async () => {
            const r = await buildingOptions(p.predio_id);
            setErro(r.erro ?? null); setPredio(p); setEscolha("");
            setOpcoes(tipo === "anuncio"
              ? r.plantas.map((x) => ({ id: x.id, rotulo: `Planta de ${area(Number(x.area_iptu_referencia))} (${x.qtd_unidades} un.)` }))
              : r.unidades.map((x) => ({ id: x.id, rotulo: x.complemento ?? "sem complemento" })));
          })}>{p.endereco} · {p.bairro}</button></li>
        ))}</ul>
      ))}
      {predio && (
        <div className="space-y-2">
          <p>Prédio: <strong>{predio.endereco}</strong></p>
          <select aria-label={tipo === "anuncio" ? "Planta" : "Unidade"} value={escolha} onChange={(e) => setEscolha(e.target.value)} className="h-7 w-full rounded-md border border-input bg-white px-1">
            <option value="">{tipo === "anuncio" ? "Só o prédio (sem planta)" : "Só o prédio (sem unidade)"}</option>
            {opcoes.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
          <Button size="sm" disabled={pendente} onClick={() => iniciar(async () => {
            const r = tipo === "anuncio" ? await matchAd(id, predio.predio_id, escolha || null) : await matchEdital(id, predio.predio_id, escolha || null);
            setErro(r.erro ?? null); if (r.ok) setAberto(false);
          })}>Vincular</Button>
        </div>
      )}
      {erro && <p role="alert" className="text-destructive">{erro}</p>}
      <button type="button" className="text-muted-foreground hover:underline" onClick={() => setAberto(false)}>Fechar</button>
    </div>
  );
}
