/**
 * Regra 11.2: bairro de cada guia do ITBI (épico 8.3). Ordem:
 *  (1) campo bairro normalizado casa com os padroes_nome de um bairro → "campo";
 *  (2) senão, o SQL existe em m2_unidades → bairro do prédio → "iptu";
 *  (3) senão, voto por CEP de 8 dígitos entre guias do mesmo ano com bairro conhecido
 *      (≥ 60% e ≥ 2 votos) → "cep";
 *  (4) senão, voto por setor+quadra (6 primeiros dígitos do SQL), mesmo critério → "quadra".
 * Em todos os casos o CEP da guia precisa começar com um prefixo do bairro escolhido; se não
 * começar, a guia é descartada (o primeiro passo que acha um bairro decide).
 * Os votos vêm das guias resolvidas nos passos 1 e 2 ("bairro conhecido").
 */
import { BAIRRO_VOTO_FRACAO_MINIMA, BAIRRO_VOTO_MINIMO } from "../config/regras.js";
import { normalizeText } from "../shared/endereco.js";
import type { Neighborhood } from "../iptu/montagem.js";
import type { Guia } from "./guias.js";

export type OrigemBairro = "campo" | "iptu" | "cep" | "quadra";

export interface GuiaComBairro {
  guia: Guia;
  bairroId: number;
  origem: OrigemBairro;
}

export interface ResultadoBairros {
  atribuidas: GuiaComBairro[];
  /** Motivo → quantidade de guias descartadas (para o log da execução). */
  descartes: Record<string, number>;
}

/**
 * Atribui o bairro às guias de um ano.
 * Recebe: guias, bairros (11.2) e o bairro do prédio de cada SQL já cadastrado no IPTU.
 * Devolve: guias com bairro e origem; contagem de descartes por motivo.
 */
export function assignNeighborhoods(
  guias: readonly Guia[],
  bairros: readonly Neighborhood[],
  bairroPorSql: ReadonlyMap<string, number>,
): ResultadoBairros {
  const descartes: Record<string, number> = {};
  const descartar = (motivo: string) => (descartes[motivo] = (descartes[motivo] ?? 0) + 1);
  const temPrefixo = (cep: string | null, id: number) =>
    !!cep && !!bairros.find((b) => b.id === id)?.prefixosCep.some((p) => cep.startsWith(p));

  // Passos 1 e 2.
  const pendentes: Guia[] = [];
  const atribuidas: GuiaComBairro[] = [];
  for (const g of guias) {
    const porCampo = fieldNeighborhood(g.bairroCampo, bairros);
    const candidato: [number, OrigemBairro] | null =
      porCampo !== null ? [porCampo, "campo"] : bairroPorSql.has(g.sql) ? [bairroPorSql.get(g.sql)!, "iptu"] : null;
    if (!candidato) {
      pendentes.push(g);
      continue;
    }
    if (temPrefixo(g.cep, candidato[0])) atribuidas.push({ guia: g, bairroId: candidato[0], origem: candidato[1] });
    else descartar(`CEP fora dos prefixos do bairro (passo ${candidato[1]})`);
  }

  // Passos 3 e 4: votos entre as guias com bairro conhecido.
  const votosCep = new Map<string, number[]>();
  const votosQuadra = new Map<string, number[]>();
  for (const a of atribuidas) {
    if (a.guia.cep) push(votosCep, a.guia.cep, a.bairroId);
    push(votosQuadra, a.guia.sql.slice(0, 6), a.bairroId);
  }
  for (const g of pendentes) {
    const porCep = g.cep ? vote(votosCep.get(g.cep) ?? []) : null;
    const candidato: [number, OrigemBairro] | null =
      porCep !== null ? [porCep, "cep"] : ((q) => (q !== null ? [q, "quadra"] : null))(vote(votosQuadra.get(g.sql.slice(0, 6)) ?? []));
    if (!candidato) {
      descartar("fora dos 10 bairros (nenhum passo da 11.2 achou bairro)");
      continue;
    }
    if (temPrefixo(g.cep, candidato[0])) atribuidas.push({ guia: g, bairroId: candidato[0], origem: candidato[1] });
    else descartar(`CEP fora dos prefixos do bairro (passo ${candidato[1]})`);
  }
  return { atribuidas, descartes };
}

/**
 * Passo 1: o campo bairro normalizado casa com os padrões de exatamente um bairro.
 * Recebe: campo bairro da guia e bairros. Devolve: id do bairro ou nulo.
 */
export function fieldNeighborhood(campo: string | null, bairros: readonly Neighborhood[]): number | null {
  const c = normalizeText(campo);
  if (!c) return null;
  const achados = bairros.filter((b) => b.padroesNome.some((p) => new RegExp(p).test(c)));
  return achados.length === 1 ? achados[0]!.id : null;
}

/**
 * Votação da 11.2: o mais votado vence com ≥ 60% dos votos e ≥ 2 votos.
 * Recebe: votos (ids de bairro). Devolve: id vencedor ou nulo. (O prefixo de CEP é checado por quem chama.)
 */
export function vote(votos: readonly number[]): number | null {
  if (!votos.length) return null;
  const contagem = new Map<number, number>();
  for (const v of votos) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const [vencedor, n] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return n >= BAIRRO_VOTO_MINIMO && n / votos.length >= BAIRRO_VOTO_FRACAO_MINIMA ? vencedor : null;
}

/** Acrescenta um voto na lista da chave. */
function push(m: Map<string, number[]>, k: string, v: number): void {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}
