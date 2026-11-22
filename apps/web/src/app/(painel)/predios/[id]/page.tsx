/**
 * [Admin] Ficha do prédio (seção 10; critério 4 do 8.7). Cabeçalho (endereço, ano, pavimentos,
 * padrão, vagas com cadastro próprio, fator do prédio) e abas Plantas, Vendas (com período e
 * resumo), Anúncios e Editais (com link externo) e Histórico de calibração. Só leitura: as ações
 * (confirmar área, marcar especial, outlier, casar/descartar) entram no 8.8.
 * ?aba= abre direto numa aba (usado pela fila de revisão do 8.8); ?meses= filtra as vendas.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { COBERTURA_JANELA_MESES } from "@m2-real/ingestao/regras";
import { EstadoVazio } from "@/components/estado-vazio";
import { SeloArea } from "@/components/selo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadBuildingFile } from "@/features/ficha/dados";
import { PERIODOS_VENDAS, parsePeriod, salesSummary } from "@/lib/estatistica";
import { area, data, dataHora, fator, numero, reais, reaisPorM2 } from "@/lib/formato";
import { label, ROTULO_FONTE, ROTULO_MOTIVO, ROTULO_STATUS_CASAMENTO } from "@/lib/rotulos";
import { parseSelo } from "@/lib/selos";

const ABAS = ["plantas", "vendas", "anuncios", "editais", "historico"] as const;
const externo = { target: "_blank", rel: "noopener noreferrer", className: "text-primary hover:underline" } as const;

export default async function FichaPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; meses?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const meses = parsePeriod(sp.meses, COBERTURA_JANELA_MESES);
  const ficha = await loadBuildingFile(id, meses);
  if (!ficha) notFound();
  const { predio: p, plantas, vendas, anuncios, editais, historico } = ficha;
  const aba = (ABAS as readonly string[]).includes(sp.aba ?? "") ? sp.aba! : "plantas";
  const resumo = salesSummary(vendas.map((v) => ({ m2_privativo: v.m2_privativo === null ? null : Number(v.m2_privativo), fora_da_curva: v.fora_da_curva })));
  const bairro = (p.bairro as unknown as { nome: string } | null)?.nome;
  const outrosNumeros = p.numeros_imovel.filter((n) => n !== p.numero);

  return (
    <div className="space-y-6">
      <Link href="/predios" className="text-sm text-primary hover:underline">← Prédios</Link>
      <header>
        <h1 className="text-2xl font-semibold">{p.logradouro}{p.numero ? `, ${p.numero}` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          {bairro}{outrosNumeros.length > 0 && ` · também nº ${outrosNumeros.join(", ")}`}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-6">
          {[
            ["Ano", p.ano_construcao ?? "—"], ["Pavimentos", p.qtd_pavimentos ?? "—"], ["Padrão", p.padrao_iptu ?? "—"],
            ["Unidades", numero(p.total_unidades_residenciais)], ["Vagas com cadastro próprio", p.vagas_cadastro_proprio ? "sim" : "não"],
            ["Fator do prédio", fator(p.fator_predio === null ? null : Number(p.fator_predio))],
          ].map(([t, v]) => (
            <div key={String(t)}><dt className="text-xs text-muted-foreground">{t}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </header>

      <Tabs defaultValue={aba}>
        <TabsList variant="line">
          <TabsTrigger value="plantas">Plantas ({plantas.length})</TabsTrigger>
          <TabsTrigger value="vendas">Vendas ({vendas.length})</TabsTrigger>
          <TabsTrigger value="anuncios">Anúncios ({anuncios.length})</TabsTrigger>
          <TabsTrigger value="editais">Editais ({editais.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({historico.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="plantas" className="pt-4">
          {plantas.length === 0 ? <EstadoVazio mensagem="Este prédio não tem plantas." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">Área IPTU</TableHead><TableHead className="text-right">Área privativa</TableHead>
                <TableHead className="text-right">Fator</TableHead><TableHead>Selo</TableHead><TableHead className="text-right">Vagas inclusas</TableHead>
                <TableHead className="text-right">Quartos</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Observações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {plantas.map((pl) => (
                  <TableRow key={pl.id}>
                    <TableCell className="text-right tabular-nums">{area(Number(pl.area_iptu_referencia))}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {area(pl.area_privativa === null ? null : Number(pl.area_privativa))}
                      {pl.faixa_erro_pct !== null && <span className="text-xs text-muted-foreground"> ±{Number(pl.faixa_erro_pct).toLocaleString("pt-BR")}%</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fator(pl.fator === null ? null : Number(pl.fator))}</TableCell>
                    <TableCell><SeloArea selo={parseSelo(pl.selo)} fonte={pl.fonte_area} /></TableCell>
                    <TableCell className="text-right tabular-nums">{pl.vagas_inclusas ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pl.quartos ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pl.qtd_unidades}</TableCell>
                    <TableCell className="text-xs">
                      {[pl.especial && "Especial", pl.revisao_pendente && `Revisão: ${label(ROTULO_MOTIVO, pl.motivo_revisao)}`].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="vendas" className="space-y-3 pt-4">
          <form method="get" className="flex items-center gap-2 text-sm">
            <input type="hidden" name="aba" value="vendas" />
            <label htmlFor="meses" className="text-muted-foreground">Período</label>
            <select id="meses" name="meses" defaultValue={sp.meses ?? String(COBERTURA_JANELA_MESES)} className="h-8 rounded-lg border border-input bg-white px-2">
              {PERIODOS_VENDAS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
            <button type="submit" className="text-primary hover:underline">Aplicar</button>
          </form>
          {vendas.length === 0 ? <EstadoVazio mensagem="Nenhuma venda registrada neste prédio no período." /> : (
            <>
              <p className="text-sm">
                Mediana do m² privativo: <strong className="tabular-nums">{reaisPorM2(resumo.mediana)}</strong>
                <span className="text-muted-foreground"> · {resumo.naMediana} de {resumo.total} vendas (sem as fora da curva e as sem área)</span>
              </p>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Apartamento</TableHead><TableHead className="text-right">Vagas</TableHead>
                  <TableHead className="text-right">Área privativa</TableHead><TableHead>Selo</TableHead>
                  <TableHead className="text-right">m² privativo</TableHead><TableHead className="text-right">m² IPTU</TableHead><TableHead>Fora da curva</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {vendas.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="tabular-nums">{data(v.data_transacao)}</TableCell>
                      <TableCell>{(v.unidade as unknown as { complemento: string | null } | null)?.complemento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(Number(v.valor_total))}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(Number(v.valor_apartamento))}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.qtd_vagas_separadas > 0 ? `${reais(Number(v.valor_vagas))} (${v.qtd_vagas_separadas})` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{area(v.area_privativa === null ? null : Number(v.area_privativa))}</TableCell>
                      <TableCell><SeloArea selo={parseSelo(v.selo_area)} fonte={(v.planta as unknown as { fonte_area: string | null } | null)?.fonte_area} /></TableCell>
                      <TableCell className="text-right tabular-nums">{reaisPorM2(v.m2_privativo === null ? null : Number(v.m2_privativo))}</TableCell>
                      <TableCell className="text-right tabular-nums">{reaisPorM2(Number(v.m2_iptu))}</TableCell>
                      <TableCell>{v.fora_da_curva ? <span className="text-xs font-medium">Sim</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </TabsContent>

        <TabsContent value="anuncios" className="pt-4">
          {anuncios.length === 0 ? <EstadoVazio mensagem="Nenhum anúncio casado com este prédio." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Domínio</TableHead><TableHead>Tipo</TableHead><TableHead>Finalidade</TableHead><TableHead className="text-right">Área</TableHead>
                <TableHead className="text-right">Quartos</TableHead><TableHead className="text-right">Vagas</TableHead><TableHead className="text-right">Andar</TableHead>
                <TableHead className="text-right">Preço pedido</TableHead><TableHead>Vínculo</TableHead><TableHead>Link</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {anuncios.map((a) => {
                  const faixa = a.area_privativa_min !== null && a.area_privativa_max !== null && Number(a.area_privativa_min) < Number(a.area_privativa_max);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{a.dominio}</TableCell>
                      <TableCell>{label(ROTULO_FONTE, a.fonte)}</TableCell>
                      <TableCell>{a.finalidade ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {area(a.area_privativa === null ? null : Number(a.area_privativa))}
                        {faixa && <span className="block text-xs text-muted-foreground">faixa {Number(a.area_privativa_min)}–{Number(a.area_privativa_max)} m²</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.quartos ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.vagas ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.andar ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(a.preco_pedido === null ? null : Number(a.preco_pedido))}</TableCell>
                      <TableCell>{label(ROTULO_STATUS_CASAMENTO, a.status_casamento)}</TableCell>
                      <TableCell><a href={a.url} {...externo}>Abrir</a></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="editais" className="pt-4">
          {editais.length === 0 ? <EstadoVazio mensagem="Nenhum edital de leilão casado com este prédio." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Site</TableHead><TableHead>Unidade</TableHead><TableHead>Matrícula</TableHead><TableHead className="text-right">Área privativa</TableHead>
                <TableHead className="text-right">Área total</TableHead><TableHead className="text-right">Vagas</TableHead><TableHead className="text-right">Avaliação</TableHead>
                <TableHead>Leilão</TableHead><TableHead>Vínculo</TableHead><TableHead>Links</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {editais.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.dominio}</TableCell>
                    <TableCell>{(e.unidade as unknown as { complemento: string | null } | null)?.complemento ?? e.complemento_extraido ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{e.matricula ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{area(e.area_privativa === null ? null : Number(e.area_privativa))}</TableCell>
                    <TableCell className="text-right tabular-nums">{area(e.area_total === null ? null : Number(e.area_total))}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.vagas ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{reais(e.valor_avaliacao === null ? null : Number(e.valor_avaliacao))}</TableCell>
                    <TableCell className="tabular-nums">{data(e.data_leilao)}</TableCell>
                    <TableCell>{label(ROTULO_STATUS_CASAMENTO, e.status_casamento)}</TableCell>
                    <TableCell className="space-x-2">
                      <a href={e.url} {...externo}>Lote</a>
                      {e.url_documento && <a href={e.url_documento} {...externo}>PDF</a>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="historico" className="pt-4">
          {historico.length === 0 ? <EstadoVazio mensagem="Nenhuma calibração registrada neste prédio." /> : (
            <ol className="space-y-3">
              {historico.map((h) => (
                <li key={h.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular-nums text-muted-foreground">{dataHora(h.criado_em)}</span>
                    <span>Planta de {area(Number(h.plantaArea))}</span>
                    <span>→ {area(h.area_privativa === null ? null : Number(h.area_privativa))}</span>
                    <span>fator {fator(h.fator === null ? null : Number(h.fator))}</span>
                    <SeloArea selo={parseSelo(h.selo)} fonte={h.fonte} />
                    <span className="text-muted-foreground">{label(ROTULO_FONTE, h.fonte)} · {h.autor}</span>
                  </div>
                  {h.observacao && <p className="mt-1 text-muted-foreground">{h.observacao}</p>}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
