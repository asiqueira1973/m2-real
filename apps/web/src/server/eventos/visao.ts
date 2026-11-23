/**
 * Eventos de produto no Visão de Produto (seção 21; épico 8.12). SÓ SERVIDOR.
 * - Dois eventos: a primeira conexão de uma pessoa e cada consulta de um assistente a uma ferramenta.
 * - Catálogo fechado: as propriedades passam por um schema `.strict()`; o que não está nele não sai.
 *   Nunca vão o endereço, o texto da pergunta nem os argumentos da ferramenta.
 * - Dispara e esquece: o envio roda depois da resposta (after do Next), com timeout, e um erro só
 *   vai para o log (com o nome do evento, nunca o conteúdo).
 * - Sem VISAO_INGEST_URL ou VISAO_API_KEY (ambiente local e testes), não faz nada.
 */
import { createHash, randomUUID } from "node:crypto";
import { VISAO_TIMEOUT_MS } from "@m2-real/ingestao/regras";
import { after } from "next/server";
import { z } from "zod";

const FERRAMENTAS = ["sobre", "buscar_predio", "ficha_predio", "vendas_predio", "m2_bairro", "comparaveis"] as const;

/** Catálogo (seção 21): nome, tela, descrição e o schema fechado das propriedades. */
export const EVENTOS = {
  fechou_por_quanto_primeira_conexao: {
    tela: "Entrar com Google",
    descricao: "pessoa entrou com o Google pela primeira vez para conectar um assistente",
    schema: z.object({}).strict(),
  },
  fechou_por_quanto_pergunta: {
    tela: "MCP",
    descricao: "assistente consultou uma ferramenta do Fechou por Quanto",
    schema: z.object({
      ferramenta: z.enum(FERRAMENTAS),
      credencial: z.enum(["oauth", "chave"]),
      cliente: z.string().max(100).nullable(),
    }).strict(),
  },
} as const;

export type NomeEvento = keyof typeof EVENTOS;
export type Propriedades<N extends NomeEvento> = z.infer<(typeof EVENTOS)[N]["schema"]>;

/** Id estável a partir de uma chave (o mesmo evento do mesmo registro é deduplicado no ingest). */
export function stableId(chave: string): string {
  const h = createHash("sha256").update(chave).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Monta o corpo do ingest. Recebe: nome, quem (distinct_id), propriedades, chave opcional e o instante.
 * Devolve: o corpo, ou nulo se as propriedades não passarem no schema (o evento é descartado).
 */
export function buildPayload<N extends NomeEvento>(nome: N, quem: string, propriedades: Propriedades<N>, chave?: string, agora = new Date()) {
  const e = EVENTOS[nome];
  const ok = e.schema.safeParse(propriedades);
  if (!ok.success) return null;
  return {
    eventos: [{
      id: chave ? stableId(`${nome}:${chave}`) : randomUUID(),
      nome,
      distinct_id: quem,
      ocorrido_em: agora.toISOString(),
      tela: e.tela,
      descricao: e.descricao,
      propriedades: ok.data,
    }],
  };
}

/** Posta o corpo no ingest. Recebe: o corpo. Devolve: nada; erro só no log. */
export async function send(corpo: unknown, rotulo: string): Promise<void> {
  const url = process.env.VISAO_INGEST_URL;
  const chave = process.env.VISAO_API_KEY;
  if (!url || !chave) return;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(VISAO_TIMEOUT_MS),
    });
    if (!r.ok) console.error(`evento_falhou ${rotulo} ${r.status}`);
  } catch (e) {
    console.error(`evento_falhou ${rotulo} ${(e as Error).name}`);
  }
}

/**
 * Registra um evento depois da resposta. Recebe: nome e uma função que devolve quem e as
 * propriedades (pode consultar o banco; nulo descarta), e a chave de deduplicação opcional.
 * Devolve: nada (o envio fica para depois da resposta).
 */
export function track<N extends NomeEvento>(nome: N, calcular: () => Promise<{ quem: string; propriedades: Propriedades<N> } | null>, chave?: string): void {
  if (!process.env.VISAO_INGEST_URL || !process.env.VISAO_API_KEY) return;
  after(async () => {
    try {
      const r = await calcular();
      if (!r) return;
      const corpo = buildPayload(nome, r.quem, r.propriedades, chave);
      if (corpo) await send(corpo, nome);
    } catch (e) {
      console.error(`evento_falhou ${nome} ${(e as Error).message}`);
    }
  });
}

/**
 * Nomes das ferramentas chamadas numa requisição JSON-RPC do MCP (tools/call), em lote ou não.
 * Recebe: o corpo já lido. Devolve: as ferramentas conhecidas (desconhecidas ficam de fora).
 */
export function toolCalls(corpo: unknown): (typeof FERRAMENTAS)[number][] {
  const itens = Array.isArray(corpo) ? corpo : [corpo];
  return itens.flatMap((m) => {
    const x = m as { method?: unknown; params?: { name?: unknown } } | null;
    const nome = x?.method === "tools/call" ? x.params?.name : null;
    return typeof nome === "string" && (FERRAMENTAS as readonly string[]).includes(nome) ? [nome as (typeof FERRAMENTAS)[number]] : [];
  });
}
