/**
 * [Admin] Evidências sem vínculo (seção 10; critério 3 do 8.8). Abas Anúncios (ambíguos e sem
 * prédio) e Editais (sem prédio e casados só ao prédio), com endereço extraído, área e link.
 * Ações: Vincular (busca de prédio e escolha de planta/unidade) e Descartar. Filtros: domínio e status.
 */
import Link from "next/link";
import { EstadoVazio } from "@/components/estado-vazio";
import { BotaoAcao } from "@/components/revisao/botao-acao";
import { Vincular } from "@/components/revisao/vincular";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EVIDENCIAS_LIMITE, loadUnlinked, STATUS_EVIDENCIAS } from "@/features/revisao/dados";
import { matchAd, matchEdital } from "@/features/revisao/acoes";
import { area } from "@/lib/formato";
import { label, ROTULO_STATUS_CASAMENTO } from "@/lib/rotulos";

const campo = "h-8 rounded-lg border border-input bg-white px-2 text-sm";
const externo = { target: "_blank", rel: "noopener noreferrer", className: "text-primary hover:underline" } as const;

export default async function EvidenciasPage({ searchParams }: { searchParams: Promise<{ aba?: string; dominio?: string; status?: string }> }) {
  const sp = await searchParams;
  const aba = sp.aba === "editais" ? "editais" : "anuncios";
  const status = (STATUS_EVIDENCIAS[aba] as readonly string[]).includes(sp.status ?? "") ? sp.status! : null;
  const dominio = sp.dominio?.trim() || null;
  const { anuncios, editais } = await loadUnlinked(aba, dominio, status);
  const linhas = aba === "anuncios" ? anuncios.length : editais.length;
  const endereco = (l: string | null, n: number | null) => (l ? `${l}${n ? `, ${n}` : ""}` : "—");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Evidências sem vínculo</h1>
      <nav className="flex gap-4 border-b border-border text-sm" aria-label="Abas">
        {(["anuncios", "editais"] as const).map((a) => (
          <Link key={a} href={`/evidencias?aba=${a}`} aria-current={aba === a ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2 ${aba === a ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`}>
            {a === "anuncios" ? "Anúncios" : "Editais"}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="aba" value={aba} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Domínio
          <input name="dominio" defaultValue={dominio ?? ""} placeholder="ex.: lopes.com.br" className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Status
          <select name="status" defaultValue={status ?? ""} className={campo}>
            <option value="">Todos</option>
            {STATUS_EVIDENCIAS[aba].map((s) => <option key={s} value={s}>{label(ROTULO_STATUS_CASAMENTO, s)}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm">Filtrar</Button>
      </form>

      {linhas === 0 ? <EstadoVazio mensagem="Nenhuma evidência sem vínculo com esses filtros." /> : aba === "anuncios" ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Domínio</TableHead><TableHead>Endereço extraído</TableHead><TableHead>Condomínio</TableHead><TableHead className="text-right">Área</TableHead>
            <TableHead className="text-right">Quartos</TableHead><TableHead className="text-right">Vagas</TableHead><TableHead>Status</TableHead><TableHead>Link</TableHead><TableHead>Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {anuncios.map((a) => (
              <TableRow key={a.id} className="align-top">
                <TableCell>{a.dominio}</TableCell>
                <TableCell>{endereco(a.logradouro_extraido, a.numero_extraido)}</TableCell>
                <TableCell>{a.nome_condominio ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {area(a.area_privativa === null ? null : Number(a.area_privativa))}
                  {a.area_privativa_min !== null && a.area_privativa_max !== null && Number(a.area_privativa_min) < Number(a.area_privativa_max) &&
                    <span className="block text-xs text-muted-foreground">faixa {Number(a.area_privativa_min)}–{Number(a.area_privativa_max)} m²</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.quartos ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{a.vagas ?? "—"}</TableCell>
                <TableCell>{label(ROTULO_STATUS_CASAMENTO, a.status_casamento)}</TableCell>
                <TableCell><a href={a.url} {...externo}>Abrir</a></TableCell>
                <TableCell className="flex flex-col items-start gap-1">
                  <Vincular tipo="anuncio" id={a.id} sugestao={endereco(a.logradouro_extraido, a.numero_extraido).replace("—", "")} />
                  <BotaoAcao rotulo="Descartar" confirmar="Descartar este anúncio?" acao={matchAd.bind(null, a.id, null, null, a.predio_id ?? undefined)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Site</TableHead><TableHead>Endereço extraído</TableHead><TableHead>Complemento</TableHead><TableHead>Matrícula</TableHead>
            <TableHead className="text-right">Área privativa</TableHead><TableHead className="text-right">Vagas</TableHead><TableHead>Status</TableHead><TableHead>Links</TableHead><TableHead>Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {editais.map((e) => (
              <TableRow key={e.id} className="align-top">
                <TableCell>{e.dominio}</TableCell>
                <TableCell>{endereco(e.logradouro_extraido, e.numero_extraido)}</TableCell>
                <TableCell>{e.complemento_extraido ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{e.matricula ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{area(e.area_privativa === null ? null : Number(e.area_privativa))}</TableCell>
                <TableCell className="text-right tabular-nums">{e.vagas ?? "—"}</TableCell>
                <TableCell>{label(ROTULO_STATUS_CASAMENTO, e.status_casamento)}</TableCell>
                <TableCell className="space-x-2"><a href={e.url} {...externo}>Lote</a>{e.url_documento && <a href={e.url_documento} {...externo}>PDF</a>}</TableCell>
                <TableCell className="flex flex-col items-start gap-1">
                  <Vincular tipo="edital" id={e.id} sugestao={endereco(e.logradouro_extraido, e.numero_extraido).replace("—", "")} />
                  <BotaoAcao rotulo="Descartar" confirmar="Descartar este edital?" acao={matchEdital.bind(null, e.id, null, null, e.predio_id ?? undefined)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {linhas === EVIDENCIAS_LIMITE && <p className="text-xs text-muted-foreground">Mostrando as {EVIDENCIAS_LIMITE} mais recentes; use os filtros para ver as outras.</p>}
    </div>
  );
}
