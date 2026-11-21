/**
 * Montagem de prédios, unidades e plantas a partir das linhas do IPTU (épico 8.2).
 * Funções puras, sem banco, testadas com Vitest. Regras: 11.3 (tipo de unidade),
 * 11.4 (prédio), 11.6 (vagas com cadastro próprio), 11.7 (plantas e andar) e o
 * bairro do prédio pela lógica da 11.2 (campo → voto por CEP → voto por quadra, sempre
 * com o prefixo de CEP), por decisão do usuário em 21/11/2026 (plans/8.2-iptu.md).
 */
import {
  ANDAR_MAX_DIGITOS_NUMERO,
  BAIRRO_VOTO_FRACAO_MINIMA,
  BAIRRO_VOTO_MINIMO,
  PLANTA_TOLERANCIA_AREA,
  PREDIO_MIN_APARTAMENTOS,
  USO_APARTAMENTO_PREFIXO,
  USO_VAGA_CONTEM,
} from "../config/regras.js";
import { normalizeAddress, normalizeText } from "../shared/endereco.js";

export type UnitType = "apartamento" | "vaga" | "outro";

/** Uma linha do IPTU já lida pela allowlist de colunas (iptu/colunas.ts). Sem dado pessoal (seção 20). */
export interface IptuRow {
  sql: string; // 11 dígitos: setor (3) + quadra (3) + lote (4) + dígito (1)
  exercicio: number;
  numeroCondominio: string | null;
  logradouro: string;
  numero: number | null;
  complemento: string | null;
  bairro: string | null;
  cep: string; // 8 dígitos
  fracaoIdeal: number | null;
  areaConstruida: number;
  anoConstrucao: number | null;
  pavimentos: number | null;
  uso: string;
  padrao: string | null;
}

/** Bairro coberto (m2_bairros), com prefixos de CEP e padrões de nome da tabela 11.2. */
export interface Neighborhood {
  id: number;
  slug: string;
  prefixosCep: string[];
  padroesNome: string[];
}

export interface Unit {
  sql: string;
  tipoUnidade: UnitType;
  complemento: string | null;
  usoIptu: string;
  areaConstruida: number;
  fracaoIdeal: number | null;
  andarInferido: number | null;
  /** Índice da planta em Building.plantas; nulo para vagas e outros usos. */
  plantaIndex: number | null;
}

export interface PlantGroup {
  areaIptuReferencia: number; // mediana da área construída do grupo (7.2)
  qtdUnidades: number;
}

export interface Building {
  chavePredio: string;
  setor: string;
  quadra: string;
  numeroCondominio: string;
  bairroId: number;
  logradouro: string; // normalizado (regra 11.5)
  numero: number | null; // o mais frequente entre os apartamentos
  /** P3 (decisão do usuário): todos os números de imóvel do condomínio, para a busca. */
  numerosImovel: number[];
  cep: string;
  origemBairro: "campo" | "cep" | "quadra";
  anoConstrucao: number | null;
  qtdPavimentos: number | null;
  padraoIptu: string | null;
  totalUnidadesResidenciais: number;
  vagasCadastroProprio: boolean;
  exercicioIptu: number;
  units: Unit[];
  plantas: PlantGroup[];
}

export interface Discard {
  chave: string;
  motivo: string;
  linhas: number;
}

/**
 * Regra 11.3: classifica a unidade pelo uso do IPTU.
 * Recebe: descrição do uso. Devolve: "apartamento" se começa com "APARTAMENTO EM
 * CONDOMÍNIO", "vaga" se contém "GARAGEM", senão "outro" (comparação sem acento).
 */
export function unitType(uso: string): UnitType {
  const u = normalizeText(uso);
  if (u.startsWith(USO_APARTAMENTO_PREFIXO)) return "apartamento";
  if (u.includes(USO_VAGA_CONTEM)) return "vaga";
  return "outro";
}

/**
 * Regra 11.7: andar inferido a partir do complemento ("APTO 72" → 7; "AP 24" → 2;
 * "APTO 1201" → 12).
 * Interpretação (plans/8.2-iptu.md): o texto da regra diz "sem os 2 últimos dígitos",
 * mas os exemplos do próprio spec tiram 1 dígito de números com até 2 dígitos e 2 dígitos
 * de números com 3 ou mais. Seguimos os exemplos.
 * Recebe: complemento. Devolve: andar, ou nulo se o complemento não tem número.
 */
export function inferFloor(complemento: string | null | undefined): number | null {
  const m = (complemento ?? "").match(/\d+/);
  if (!m) return null;
  const digits = m[0].replace(/^0+(?=\d)/, "");
  // Número com mais de 4 dígitos é matrícula/código, não apartamento (bug da 2ª carga real).
  if (digits.length > ANDAR_MAX_DIGITOS_NUMERO) return null;
  const drop = digits.length <= 2 ? 1 : 2;
  const rest = digits.slice(0, -drop);
  return rest === "" ? 0 : Number(rest);
}

/**
 * Regra 11.2, passo 1 ("campo"): o campo bairro normalizado casa com os padrões de um
 * bairro cujo prefixo de CEP também casa com o CEP.
 * Recebe: CEP (8 dígitos), campo bairro, bairros. Devolve: id do bairro ou nulo.
 */
export function matchNeighborhoodByField(
  cep: string,
  bairroCampo: string | null,
  bairros: readonly Neighborhood[],
): number | null {
  const campo = normalizeText(bairroCampo);
  if (!campo) return null;
  const achados = bairros.filter(
    (b) => b.prefixosCep.some((p) => cep.startsWith(p)) && b.padroesNome.some((p) => new RegExp(p).test(campo)),
  );
  return achados.length === 1 ? achados[0]!.id : null;
}

/**
 * Regra 11.2, passos 3 e 4 (voto por CEP / por quadra): o bairro mais votado vence se
 * tiver ≥ 60% dos votos e ≥ 2 votos, e se o prefixo de CEP do bairro casar com o CEP.
 * Recebe: votos (ids de bairro já conhecidos), CEP do item, bairros. Devolve: id ou nulo.
 */
export function voteNeighborhood(votos: readonly number[], cep: string, bairros: readonly Neighborhood[]): number | null {
  if (votos.length === 0) return null;
  const contagem = new Map<number, number>();
  for (const v of votos) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  const [vencedor, n] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]!;
  if (n < BAIRRO_VOTO_MINIMO || n / votos.length < BAIRRO_VOTO_FRACAO_MINIMA) return null;
  const bairro = bairros.find((b) => b.id === vencedor);
  return bairro && bairro.prefixosCep.some((p) => cep.startsWith(p)) ? vencedor : null;
}

/** Mediana de uma lista não vazia de números. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Regra 11.7: agrupa áreas em plantas. Ordena pela área e abre um grupo novo quando a
 * área se afasta mais que PLANTA_TOLERANCIA_AREA (3%) da mediana do grupo corrente.
 * Recebe: áreas construídas dos apartamentos. Devolve: grupos (área de referência =
 * mediana, quantidade) e, para cada área de entrada, o índice do grupo.
 */
export function groupPlans(areas: readonly number[]): { plantas: PlantGroup[]; indexOf: number[] } {
  const ordem = areas.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
  const grupos: { a: number; i: number }[][] = [];
  for (const item of ordem) {
    const atual = grupos[grupos.length - 1];
    if (atual) {
      const med = median(atual.map((x) => x.a));
      if (Math.abs(item.a - med) / med <= PLANTA_TOLERANCIA_AREA) {
        atual.push(item);
        continue;
      }
    }
    grupos.push([item]);
  }
  const indexOf = new Array<number>(areas.length);
  const plantas = grupos.map((g, gi) => {
    for (const x of g) indexOf[x.i] = gi;
    return { areaIptuReferencia: round2(median(g.map((x) => x.a))), qtdUnidades: g.length };
  });
  return { plantas, indexOf };
}

/**
 * Regras 11.4 e 11.6: monta os prédios. Unidades com o mesmo setor, quadra e número de
 * condomínio formam um prédio (chave "setor-quadra-condominio"); só valem grupos com
 * ≥ PREDIO_MIN_APARTAMENTOS apartamentos. vagas_cadastro_proprio = existe unidade "vaga".
 * Recebe: linhas do IPTU (já filtradas por CEP) e os bairros. Devolve: prédios montados
 * e os grupos descartados com o motivo (vão para linhas_descartadas da execução).
 */
export function assembleBuildings(
  rows: readonly IptuRow[],
  bairros: readonly Neighborhood[],
): { buildings: Building[]; discarded: Discard[] } {
  const grupos = new Map<string, IptuRow[]>();
  const discarded: Discard[] = [];
  let semCondominio = 0;
  for (const r of rows) {
    const cond = normalizeCondominium(r.numeroCondominio);
    if (!cond) {
      semCondominio++;
      continue;
    }
    const chave = `${r.sql.slice(0, 3)}-${r.sql.slice(3, 6)}-${cond}`;
    const g = grupos.get(chave);
    if (g) g.push(r);
    else grupos.set(chave, [r]);
  }
  if (semCondominio) discarded.push({ chave: "*", motivo: "sem número de condomínio (regra 11.4)", linhas: semCondominio });

  // Fase 1: grupos com apartamentos suficientes e bairro pelo campo (11.2, passo 1).
  interface Candidate { chave: string; grupo: IptuRow[]; tipos: UnitType[]; aptos: IptuRow[]; cep: string; bairroId: number | null; origem: Building["origemBairro"] }
  const candidatos: Candidate[] = [];
  for (const [chave, grupo] of grupos) {
    const tipos = grupo.map((r) => unitType(r.uso));
    const aptos = grupo.filter((_, i) => tipos[i] === "apartamento");
    if (aptos.length < PREDIO_MIN_APARTAMENTOS) {
      discarded.push({ chave, motivo: `menos de ${PREDIO_MIN_APARTAMENTOS} apartamentos (regra 11.4)`, linhas: grupo.length });
      continue;
    }
    const cep = mode(aptos.map((r) => r.cep))!;
    // Campo: o bairro casado pela maioria das unidades com campo reconhecível.
    const porCampo = grupo.map((r) => matchNeighborhoodByField(cep, r.bairro, bairros)).filter((x): x is number => x !== null);
    const bairroCampo = mode(porCampo);
    const empate = bairroCampo !== null && new Set(porCampo).size > 1 &&
      porCampo.filter((x) => x === bairroCampo).length * 2 <= porCampo.length;
    candidatos.push({ chave, grupo, tipos, aptos, cep, bairroId: empate ? null : bairroCampo, origem: "campo" });
  }

  // Fase 2: voto por CEP de 8 dígitos e, depois, por setor+quadra, entre os prédios
  // resolvidos pelo campo (11.2, passos 3 e 4).
  const conhecidos = candidatos.filter((c) => c.bairroId !== null);
  const votosCep = groupVotes(conhecidos, (c) => c.cep);
  const votosQuadra = groupVotes(conhecidos, (c) => c.chave.slice(0, 7));
  for (const c of candidatos) {
    if (c.bairroId !== null) continue;
    const porCep = voteNeighborhood(votosCep.get(c.cep) ?? [], c.cep, bairros);
    if (porCep !== null) {
      c.bairroId = porCep;
      c.origem = "cep";
      continue;
    }
    const porQuadra = voteNeighborhood(votosQuadra.get(c.chave.slice(0, 7)) ?? [], c.cep, bairros);
    if (porQuadra !== null) {
      c.bairroId = porQuadra;
      c.origem = "quadra";
    }
  }

  const buildings: Building[] = [];
  for (const { chave, grupo, tipos, aptos, cep, bairroId, origem } of candidatos) {
    if (bairroId === null) {
      discarded.push({ chave, motivo: "fora dos 10 bairros ou bairro indecidível (regra 11.2)", linhas: grupo.length });
      continue;
    }
    const { plantas, indexOf } = groupPlans(aptos.map((r) => r.areaConstruida));
    const aptoIndex = new Map(aptos.map((r, i) => [r.sql, indexOf[i]!]));
    // A chave é "setor-quadra-condominio", e o número de condomínio do IPTU também tem
    // hífen ("01-9"): setor e quadra vêm do SQL; o condomínio, do próprio campo.
    const setor = grupo[0]!.sql.slice(0, 3);
    const quadra = grupo[0]!.sql.slice(3, 6);
    const numeroCondominio = normalizeCondominium(grupo[0]!.numeroCondominio)!;
    buildings.push({
      chavePredio: chave,
      setor,
      quadra,
      numeroCondominio,
      bairroId,
      origemBairro: origem,
      logradouro: normalizeAddress(mode(aptos.map((r) => r.logradouro))),
      numero: mode(aptos.map((r) => r.numero)),
      numerosImovel: [...new Set(grupo.map((r) => r.numero).filter((n): n is number => n !== null))].sort((a, b) => a - b),
      cep,
      anoConstrucao: mode(aptos.map((r) => r.anoConstrucao)),
      qtdPavimentos: maxOrNull(aptos.map((r) => r.pavimentos)),
      padraoIptu: mode(aptos.map((r) => r.padrao)),
      totalUnidadesResidenciais: aptos.length,
      vagasCadastroProprio: tipos.includes("vaga"), // regra 11.6
      exercicioIptu: Math.max(...grupo.map((r) => r.exercicio)),
      plantas,
      units: grupo.map((r, i) => ({
        sql: r.sql,
        tipoUnidade: tipos[i]!,
        complemento: r.complemento,
        usoIptu: r.uso,
        areaConstruida: r.areaConstruida,
        fracaoIdeal: r.fracaoIdeal,
        andarInferido: tipos[i] === "apartamento" ? inferFloor(r.complemento) : null,
        plantaIndex: aptoIndex.get(r.sql) ?? null,
      })),
    });
  }
  return { buildings, discarded };
}

/** Agrupa os bairros já conhecidos por uma chave (CEP ou setor+quadra) para a votação da 11.2. */
function groupVotes<T extends { bairroId: number | null }>(itens: readonly T[], chave: (x: T) => string): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const it of itens) {
    const k = chave(it);
    m.set(k, [...(m.get(k) ?? []), it.bairroId!]);
  }
  return m;
}

/** Número de condomínio vazio, ou só com zeros e separadores, conta como "sem condomínio". */
function normalizeCondominium(value: string | null): string | null {
  const v = (value ?? "").trim();
  return /[1-9]/.test(v) ? v : null;
}

/** Valor mais frequente (ignora nulos); empate → o primeiro que apareceu. */
function mode<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function maxOrNull(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
