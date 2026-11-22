/**
 * Leitura de PDFs de leilão (épico 8.5.1; seção 20). O PDF é baixado para um Buffer, enviado à
 * Claude API e descartado: este módulo não grava nada em disco nem no Storage (hook
 * guard-coleta.sh e teste de não persistência). A resposta passa pela allowlist de extracao.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODELO_EXTRACAO_PDF, PDF_TAMANHO_MAXIMO_BYTES } from "../config/regras.js";
import { fromDocument, PROMPT_DOCUMENTO, SCHEMA_DOCUMENTO, type EditalExtraido } from "./extracao.js";

/** Só o que este módulo usa do cliente da Anthropic (o teste injeta um falso). */
export type LeitorClaude = Pick<Anthropic, "messages">;

/**
 * Baixa um PDF para a memória.
 * Recebe: URL e (nos testes) um fetch falso. Devolve: o conteúdo em Buffer.
 * Lança erro se a resposta não for PDF (assinatura "%PDF") ou passar de PDF_TAMANHO_MAXIMO_BYTES.
 */
export async function downloadPdf(url: string, fazerFetch: typeof fetch = fetch): Promise<Buffer> {
  const resp = await fazerFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FechouPorQuantoBot/1.0)" } });
  if (!resp.ok) throw new Error(`PDF respondeu ${resp.status}: ${url}`);
  const tamanho = Number(resp.headers.get("content-length") ?? 0);
  if (tamanho > PDF_TAMANHO_MAXIMO_BYTES) throw new Error(`PDF maior que o limite (${tamanho} bytes): ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length > PDF_TAMANHO_MAXIMO_BYTES) throw new Error(`PDF maior que o limite (${buffer.length} bytes): ${url}`);
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") throw new Error(`O arquivo não é PDF: ${url}`);
  return buffer;
}

/**
 * Lê o PDF com a Claude API (13.4) e devolve só os campos permitidos.
 * Recebe: cliente, conteúdo do PDF (em memória) e a URL (para url_documento).
 * Devolve: o edital extraído, ou nulo se o documento for "outro", sem área, ou se o modelo recusar.
 */
export async function readDocument(cliente: LeitorClaude, pdf: Buffer, urlDocumento: string): Promise<EditalExtraido | null> {
  const resposta = await cliente.messages.parse({
    model: MODELO_EXTRACAO_PDF,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: PROMPT_DOCUMENTO },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(SCHEMA_DOCUMENTO) },
  });
  if (resposta.stop_reason === "refusal" || !resposta.parsed_output) return null;
  // Allowlist (seção 20): mesmo que o modelo devolva algo a mais, só os campos de m2_editais_leilao passam.
  return fromDocument(resposta.parsed_output, urlDocumento);
}
