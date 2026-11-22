/**
 * Regra 11.20: casamento edital → prédio → unidade (funções puras; épico 8.5.1).
 * O prédio vem do mesmo critério de endereço da regra 11.8 (busca no banco, em rotina.ts).
 */
import { normalizeText } from "../shared/endereco.js";

export type StatusCasamentoEdital = "casado_unidade" | "casado_predio" | "sem_predio";

export interface UnidadeDoPredio {
  id: string;
  complemento: string | null;
}

export interface GuiaComMatricula {
  unidadeId: string;
  /** Matrícula da guia do ITBI (só dígitos, sem zeros à esquerda; itbi/guias.ts). */
  matricula: string;
}

export interface CasamentoEdital {
  status: StatusCasamentoEdital;
  predioId: string | null;
  unidadeId: string | null;
}

/**
 * Chave da unidade a partir do complemento: "AP <número>" e, se houver, " BL <bloco>".
 * "APTO 52" = "AP 52" = "APARTAMENTO Nº 52" = "Apartamento 52, 5º andar" → "AP 52".
 * A letra só faz parte do número se vier colada ou com hífen ("51C", "51-C"): em "AP 65 E VG"
 * o "E" é conjunção (unidade com vaga). Recebe: complemento livre. Devolve: a chave ou nulo.
 */
export function unitKey(complemento: string | null | undefined): string | null {
  const t = normalizeText(complemento).replace(/[.,;:]/g, " ");
  const ap = t.match(/\b(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UNID)\s*(?:N[O°º]?\s*)?(\d+)(?:-?([A-Z]))?\b/);
  if (!ap) return null;
  const bl = t.match(/\b(?:BLOCO|BL|TORRE)\s*([A-Z0-9]{1,2})\b/);
  return `AP ${Number(ap[1])}${ap[2] ?? ""}${bl ? ` BL ${bl[1]}` : ""}`;
}

/**
 * Casa um edital.
 * Recebe: matrícula e complemento do edital, o prédio achado (ou nulo), as unidades do prédio e as
 * guias do ITBI com matrícula dessas unidades.
 * Devolve: status, prédio e unidade. Regra 11.20, por ordem de força:
 *  - sem prédio → sem_predio;
 *  - (1) matrícula igual à de uma guia de uma unidade do prédio → casado_unidade (se a matrícula
 *    aponta para mais de uma unidade, não decide e passa ao passo 2);
 *  - (2) chave do complemento igual à de exatamente uma unidade → casado_unidade. Se o edital não
 *    diz o bloco, as unidades com o mesmo número em blocos diferentes tornam o caso ambíguo;
 *  - (3) senão → casado_predio.
 */
export function casarEdital(
  edital: { matricula: string | null; complemento_extraido: string | null },
  predioId: string | null,
  unidades: readonly UnidadeDoPredio[],
  guias: readonly GuiaComMatricula[],
): CasamentoEdital {
  if (!predioId) return { status: "sem_predio", predioId: null, unidadeId: null };

  if (edital.matricula) {
    const doPredio = new Set(unidades.map((u) => u.id));
    const porMatricula = new Set(guias.filter((g) => g.matricula === edital.matricula && doPredio.has(g.unidadeId)).map((g) => g.unidadeId));
    if (porMatricula.size === 1) return { status: "casado_unidade", predioId, unidadeId: [...porMatricula][0]! };
  }

  const chave = unitKey(edital.complemento_extraido);
  if (chave) {
    const temBloco = chave.includes(" BL ");
    const iguais = unidades.filter((u) => {
      const k = unitKey(u.complemento);
      if (!k) return false;
      return temBloco ? k === chave : k.split(" BL ")[0] === chave;
    });
    if (iguais.length === 1) return { status: "casado_unidade", predioId, unidadeId: iguais[0]!.id };
  }

  return { status: "casado_predio", predioId, unidadeId: null };
}
