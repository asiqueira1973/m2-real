/**
 * Consolidação de vendas (épico 8.4). Funções puras, sem banco.
 * Regras: 11.14 (guia sem cadastro próprio fica fora), 11.15 (vagas vendidas em guias
 * separadas no mesmo prédio e dia) e 11.16 (venda fora da curva).
 */
import {
  FORA_CURVA_FATOR_MAX,
  FORA_CURVA_FATOR_MIN,
  FORA_CURVA_JANELA_MESES,
  FORA_CURVA_MIN_VENDAS_PREDIO,
  FORA_CURVA_VENAL_FRACAO,
  VAGAS_MAX_POR_VENDA,
} from "../config/regras.js";

export type Selo = "confirmada" | "calibrada" | "indicativa" | "estimada" | "sem_dado";

/** Guia de compra e venda ligada a uma unidade do IPTU, com a planta e o bairro do prédio. */
export interface GuiaCompraVenda {
  id: string;
  predioId: string;
  unidadeId: string;
  bairroId: number;
  tipoUnidade: "apartamento" | "vaga" | "outro";
  dataTransacao: string; // AAAA-MM-DD
  valorDeclarado: number;
  valorVenalReferencia: number | null;
  matricula: string | null;
  unidadeSemCadastroProprio: boolean;
  areaConstruida: number; // da unidade (IPTU)
  plantaId: string | null;
  plantaAreaPrivativa: number | null;
  plantaSelo: Selo;
  plantaVagasInclusas: number | null;
}

/** Linha de m2_vendas_consolidadas (7.2), mais o bairro e o valor venal para a regra 11.16. */
export interface VendaConsolidada {
  transacaoApartamentoId: string;
  transacoesVagasIds: string[];
  predioId: string;
  unidadeId: string;
  plantaId: string | null;
  bairroId: number;
  dataTransacao: string;
  valorApartamento: number;
  valorVenalReferencia: number | null;
  valorVagas: number;
  valorTotal: number;
  qtdVagasSeparadas: number;
  vagasInclusasArea: number | null;
  areaPrivativa: number | null;
  seloArea: Selo;
  m2Privativo: number | null;
  m2Iptu: number;
  foraDaCurva: boolean;
}

/**
 * Regra 11.15: monta as vendas consolidadas.
 * Para cada guia de compra e venda de apartamento (fora as da regra 11.14), agrega as guias de
 * vaga do mesmo prédio e mesma data, ainda não agregadas, até VAGAS_MAX_POR_VENDA. Com mais de
 * um apartamento no prédio e data, a vaga vai para o apartamento de matrícula mais próxima
 * (menor diferença numérica; pares avaliados do mais próximo ao mais distante). Vaga sem
 * apartamento fica fora. Cada vaga entra em no máximo uma venda.
 * Recebe: guias de compra e venda já ligadas a unidades. Devolve: vendas (foraDaCurva = false;
 * a regra 11.16 é aplicada depois por marcarForaDaCurva).
 */
export function consolidarVendas(guias: readonly GuiaCompraVenda[]): VendaConsolidada[] {
  const grupos = new Map<string, { aptos: GuiaCompraVenda[]; vagas: GuiaCompraVenda[] }>();
  for (const g of guias) {
    if (g.unidadeSemCadastroProprio) continue; // regra 11.14: não entra em venda consolidada
    if (g.tipoUnidade !== "apartamento" && g.tipoUnidade !== "vaga") continue;
    const chave = `${g.predioId}|${g.dataTransacao}`;
    const grupo = grupos.get(chave) ?? { aptos: [], vagas: [] };
    (g.tipoUnidade === "apartamento" ? grupo.aptos : grupo.vagas).push(g);
    grupos.set(chave, grupo);
  }

  const vendas: VendaConsolidada[] = [];
  for (const { aptos, vagas } of grupos.values()) {
    if (!aptos.length) continue; // vagas sem apartamento ficam fora (11.15)
    const vagasDe = distribuirVagas(aptos, vagas);
    for (const a of aptos) {
      const minhas = vagasDe.get(a.id) ?? [];
      const valorVagas = round2(minhas.reduce((s, v) => s + v.valorDeclarado, 0));
      const valorTotal = round2(a.valorDeclarado + valorVagas);
      const area = a.plantaAreaPrivativa;
      vendas.push({
        transacaoApartamentoId: a.id,
        transacoesVagasIds: minhas.map((v) => v.id),
        predioId: a.predioId,
        unidadeId: a.unidadeId,
        plantaId: a.plantaId,
        bairroId: a.bairroId,
        dataTransacao: a.dataTransacao,
        valorApartamento: a.valorDeclarado,
        valorVenalReferencia: a.valorVenalReferencia,
        valorVagas,
        valorTotal,
        qtdVagasSeparadas: minhas.length,
        vagasInclusasArea: a.plantaVagasInclusas,
        areaPrivativa: area,
        seloArea: a.plantaId ? a.plantaSelo : "sem_dado",
        m2Privativo: area ? round2(valorTotal / area) : null,
        m2Iptu: round2(a.valorDeclarado / a.areaConstruida),
        foraDaCurva: false,
      });
    }
  }
  return vendas;
}

/**
 * Regra 11.15: distribui as vagas de um prédio/data entre os apartamentos vendidos no mesmo dia,
 * pela proximidade da matrícula, com no máximo VAGAS_MAX_POR_VENDA por apartamento.
 * Recebe: apartamentos e vagas do grupo. Devolve: id do apartamento → vagas agregadas.
 */
function distribuirVagas(aptos: readonly GuiaCompraVenda[], vagas: readonly GuiaCompraVenda[]): Map<string, GuiaCompraVenda[]> {
  const pares: { a: GuiaCompraVenda; v: GuiaCompraVenda; dif: number; ordem: number }[] = [];
  let ordem = 0;
  for (const v of vagas) for (const a of aptos) pares.push({ a, v, dif: distanciaMatricula(a.matricula, v.matricula), ordem: ordem++ });
  pares.sort((x, y) => x.dif - y.dif || x.ordem - y.ordem);
  const resultado = new Map<string, GuiaCompraVenda[]>();
  const usadas = new Set<string>();
  for (const { a, v } of pares) {
    if (usadas.has(v.id)) continue; // nenhuma vaga em duas vendas (critério do 8.4)
    const lista = resultado.get(a.id) ?? [];
    if (lista.length >= VAGAS_MAX_POR_VENDA) continue;
    lista.push(v);
    resultado.set(a.id, lista);
    usadas.add(v.id);
  }
  return resultado;
}

/**
 * Regra 11.15 (proximidade da matrícula): diferença numérica entre duas matrículas.
 * Recebe: matrícula do apartamento e da vaga. Devolve: |a − b|, ou infinito se faltar uma (vai para o fim da fila).
 */
function distanciaMatricula(a: string | null, b: string | null): number {
  const na = a ? Number(a) : NaN;
  const nb = b ? Number(b) : NaN;
  return Number.isFinite(na) && Number.isFinite(nb) ? Math.abs(na - nb) : Number.POSITIVE_INFINITY;
}

/**
 * Regra 11.16: marca as vendas fora da curva.
 * - valor declarado < FORA_CURVA_VENAL_FRACAO × valor venal de referência → fora;
 * - com m2_privativo: na janela de FORA_CURVA_JANELA_MESES meses que termina na data da venda,
 *   se o prédio tem ≥ FORA_CURVA_MIN_VENDAS_PREDIO vendas com m², a referência é a mediana do
 *   prédio; senão, a mediana do bairro no mesmo selo. Fora se m² < 0,6 × ou > 1,6 × a referência.
 *   A própria venda não entra na referência nem na contagem (decisão do usuário, 22/11/2026).
 * Recebe: vendas consolidadas e, opcionalmente, o valor do admin para vendas marcadas à mão
 * (regra 11.11: o pipeline não altera). Devolve: as mesmas vendas com foraDaCurva preenchido.
 */
export function marcarForaDaCurva(
  vendas: readonly VendaConsolidada[],
  manuais: ReadonlyMap<string, boolean> = new Map(),
): VendaConsolidada[] {
  const comM2 = vendas.filter((v) => v.m2Privativo !== null).sort((a, b) => a.dataTransacao.localeCompare(b.dataTransacao));
  const porPredio = agrupar(comM2, (v) => v.predioId);
  const porBairroSelo = agrupar(comM2, (v) => `${v.bairroId}|${v.seloArea}`);

  return vendas.map((v) => {
    const manual = manuais.get(v.transacaoApartamentoId);
    if (manual !== undefined) return { ...v, foraDaCurva: manual }; // regra 11.11
    if (v.valorVenalReferencia !== null && v.valorApartamento < FORA_CURVA_VENAL_FRACAO * v.valorVenalReferencia) {
      return { ...v, foraDaCurva: true };
    }
    if (v.m2Privativo === null) return { ...v, foraDaCurva: false };
    const inicio = mesesAntes(v.dataTransacao, FORA_CURVA_JANELA_MESES);
    const doPredio = janela(porPredio.get(v.predioId) ?? [], inicio, v.dataTransacao, v);
    const referencia =
      doPredio.length >= FORA_CURVA_MIN_VENDAS_PREDIO
        ? doPredio
        : janela(porBairroSelo.get(`${v.bairroId}|${v.seloArea}`) ?? [], inicio, v.dataTransacao, v);
    if (!referencia.length) return { ...v, foraDaCurva: false };
    const med = mediana(referencia);
    return { ...v, foraDaCurva: v.m2Privativo < FORA_CURVA_FATOR_MIN * med || v.m2Privativo > FORA_CURVA_FATOR_MAX * med };
  });
}

/**
 * Regra 11.16: agrupa as vendas (já ordenadas por data) por prédio ou por bairro+selo.
 * Recebe: vendas e função de chave. Devolve: chave → vendas, na mesma ordem.
 */
function agrupar(vs: readonly VendaConsolidada[], chave: (v: VendaConsolidada) => string): Map<string, VendaConsolidada[]> {
  const m = new Map<string, VendaConsolidada[]>();
  for (const v of vs) {
    const k = chave(v);
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  }
  return m;
}

/**
 * Regra 11.16 (janela de 36 meses): m² privativo das vendas entre inicio (exclusivo) e fim (inclusive),
 * sem a própria venda (decisão do usuário, 22/11/2026).
 * Recebe: vendas ordenadas por data, as datas-limite e a venda avaliada. Devolve: os m² da janela (busca binária).
 */
function janela(ordenadas: readonly VendaConsolidada[], inicio: string, fim: string, propria: VendaConsolidada): number[] {
  const lo = buscar(ordenadas, (d) => d > inicio);
  const hi = buscar(ordenadas, (d) => d > fim);
  return ordenadas.slice(lo, hi).filter((v) => v.transacaoApartamentoId !== propria.transacaoApartamentoId).map((v) => v.m2Privativo!);
}

/**
 * Busca binária usada pela janela da regra 11.16.
 * Recebe: vendas ordenadas por data e um predicado monótono sobre a data. Devolve: primeiro índice que o satisfaz.
 */
function buscar(ordenadas: readonly VendaConsolidada[], ok: (data: string) => boolean): number {
  let lo = 0;
  let hi = ordenadas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(ordenadas[mid]!.dataTransacao)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Início da janela da regra 11.16. Recebe: data AAAA-MM-DD e n meses. Devolve: a data n meses antes.
 */
function mesesAntes(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1 - n, d)).toISOString().slice(0, 10);
}

/**
 * Mediana de referência da regra 11.16. Recebe: lista não vazia de m². Devolve: a mediana.
 */
function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
}

/**
 * Arredonda para 2 casas, como numeric(14,2) e numeric(10,2) da 7.2. Recebe: número. Devolve: número arredondado.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
