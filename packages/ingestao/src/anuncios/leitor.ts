/**
 * Extração de anúncios com o Claude (épico 8.15; seções 4.2 e 13.3). O Firecrawl entrega só o
 * markdown da página (1 crédito) e o Claude preenche o schema da 13.3. A resposta passa pela
 * mesma allowlist de extracao.ts (toAnuncio): nenhuma chave fora da lista vira coluna.
 */
import { AnthropicError, APIError, type default as Anthropic } from "@anthropic-ai/sdk";
import { isPermanentApiError } from "../shared/claude.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ANUNCIO_MARKDOWN_MAX_CARACTERES, ANUNCIO_MAX_TOKENS_RESPOSTA, MODELO_EXTRACAO_ANUNCIO } from "../config/regras.js";
import { PROMPT_ANUNCIO, SCHEMA_ANUNCIO_CLAUDE, toAnuncio, type AnuncioExtraido } from "./extracao.js";

/** Só o que este módulo usa do cliente da Anthropic (o teste injeta um falso). */
export type LeitorClaude = Pick<Anthropic, "messages">;

/**
 * Prepara o markdown para o Claude (épico 8.15: limita tokens e custo). Tira a sintaxe `![...](...)`
 * e o endereço dos links (fica o texto do link), que nas páginas reais chegam a 3/4 do markdown, junta
 * linhas em branco e corta em ANUNCIO_MARKDOWN_MAX_CARACTERES.
 * Recebe: o markdown do Firecrawl. Devolve: o texto da página, onde ficam título, área, preço e endereço.
 */
export function trimMarkdown(markdown: string): string {
  const texto = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n\s*\n+/g, "\n\n");
  return texto.length > ANUNCIO_MARKDOWN_MAX_CARACTERES ? texto.slice(0, ANUNCIO_MARKDOWN_MAX_CARACTERES) : texto;
}

/**
 * Erro de leitura que não melhora ao repetir, e por isso só descarta a página (seção 12): erro
 * permanente da API, ou saída estruturada inválida (o SDK lança AnthropicError sem status quando o
 * JSON não bate com o schema, por exemplo truncado). Erro de rede, 429 e 5xx são transitórios.
 * Recebe: o erro. Devolve: verdadeiro se a página deve ser descartada.
 */
export function isDiscardableReadError(erro: unknown): boolean {
  return isPermanentApiError(erro) || (erro instanceof AnthropicError && !(erro instanceof APIError));
}

/**
 * Lê o markdown de uma página com o Claude e devolve só os campos permitidos (13.3).
 * Recebe: cliente e o markdown. Devolve: o anúncio extraído, ou nulo se a página for "outro",
 * sem área, vazia, ou se o modelo recusar. Erros da API sobem para quem chama decidir (seção 12).
 */
export async function lerAnuncio(cliente: LeitorClaude, markdown: string): Promise<AnuncioExtraido | null> {
  const texto = trimMarkdown(markdown).trim();
  if (!texto) return null;
  const resposta = await cliente.messages.parse({
    model: MODELO_EXTRACAO_ANUNCIO,
    max_tokens: ANUNCIO_MAX_TOKENS_RESPOSTA,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `<pagina>\n${texto}\n</pagina>` },
          { type: "text", text: `O texto acima é o conteúdo de uma página de imóveis. ${PROMPT_ANUNCIO}` },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(SCHEMA_ANUNCIO_CLAUDE) },
  });
  if (resposta.stop_reason === "refusal" || !resposta.parsed_output) return null;
  // Allowlist (princípio 4): mesmo que o modelo devolva algo a mais, só os campos de m2_anuncios passam.
  return toAnuncio(resposta.parsed_output);
}
