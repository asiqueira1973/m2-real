/**
 * Montagem de prédios, unidades e plantas a partir das linhas do IPTU (épico 8.2).
 * Funções puras, sem banco, testadas com Vitest. Regras: 11.3 (tipo de unidade),
 * 11.4 (prédio), 11.6 (vagas com cadastro próprio), 11.7 (plantas e andar) e o
 * filtro/atribuição de bairro por CEP (11.2, plans/8.2-iptu.md).
 */
import {
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
  numero: number | null;
  cep: string;
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
  const drop = digits.length <= 2 ? 1 : 2;
  const rest = digits.slice(0, -drop);
  return rest === "" ? 0 : Number(rest);
}

/**
 * Bairro de um prédio (plans/8.2-iptu.md, a partir da regra 11.2).
 * 1. Candidatos: bairros com algum prefixo de CEP que casa com o CEP.
 * 2. Se o campo bairro do IPTU casa com os padrões de um candidato, vale esse.
 * 3. Senão, o candidato de prefixo mais longo, se for único (ex.: 0125 → Perdizes vence 012 → Higienópolis).
 * Recebe: CEP (8 dígitos), campo bairro do IPTU, bairros. Devolve: id do bairro ou nulo (indecidível/fora).
 */
export function resolveNeighborhood(
  cep: string,
  bairroCampo: string | null,
  bairros: readonly Neighborhood[],
): number | null {
  const candidatos = bairros
    .map((b) => ({ b, prefixo: Math.max(0, ...b.prefixosCep.filter((p) => cep.startsWith(p)).map((p) => p.length)) }))
    .filter((c) => c.prefixo > 0);
  if (candidatos.length === 0) return null;

  const campo = normalizeText(bairroCampo);
  if (campo) {
    const porNome = candidatos.filter((c) => c.b.padroesNome.some((p) => new RegExp(p).test(campo)));
    if (porNome.length === 1) return porNome[0]!.b.id;
  }
  const maior = Math.max(...candidatos.map((c) => c.prefixo));
  const melhores = candidatos.filter((c) => c.prefixo === maior);
  return melhores.length === 1 ? melhores[0]!.b.id : null;
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

  const buildings: Building[] = [];
  for (const [chave, grupo] of grupos) {
    const tipos = grupo.map((r) => unitType(r.uso));
    const aptos = grupo.filter((_, i) => tipos[i] === "apartamento");
    if (aptos.length < PREDIO_MIN_APARTAMENTOS) {
      discarded.push({ chave, motivo: `menos de ${PREDIO_MIN_APARTAMENTOS} apartamentos (regra 11.4)`, linhas: grupo.length });
      continue;
    }
    const cep = mode(aptos.map((r) => r.cep))!;
    const bairroId = resolveNeighborhood(cep, mode(aptos.map((r) => r.bairro)), bairros);
    if (bairroId === null) {
      discarded.push({ chave, motivo: `bairro indecidível pelo CEP ${cep} e pelo campo bairro`, linhas: grupo.length });
      continue;
    }
    const { plantas, indexOf } = groupPlans(aptos.map((r) => r.areaConstruida));
    const aptoIndex = new Map(aptos.map((r, i) => [r.sql, indexOf[i]!]));
    const [setor, quadra, numeroCondominio] = chave.split("-") as [string, string, string];
    buildings.push({
      chavePredio: chave,
      setor,
      quadra,
      numeroCondominio,
      bairroId,
      logradouro: normalizeAddress(mode(aptos.map((r) => r.logradouro))),
      numero: mode(aptos.map((r) => r.numero)),
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
