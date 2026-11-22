/**
 * Ponto de entrada da ingestão: `tsx src/cli.ts <rotina> [argumentos]` (seção 18.3).
 *
 * Valida o nome da rotina contra a seção 4.4 e despacha. Ligadas: 8.2 (iptu), 8.3 (itbi), 8.4 (calibracao: consolidação), 8.5 (anuncios), 8.5.1 (leiloes).
 * Entra no épico seguinte: 8.6 (resto da calibração).
 * Variáveis de ambiente: .env.local na raiz (carregado pelo script "cli"), seção 18.4.
 */
import { resolve } from "node:path";
import { createServiceClient } from "@m2-real/db/server";
import { ROTINAS, type Rotina } from "./config/regras.js";

/**
 * Nomes curtos aceitos na linha de comando, como no exemplo da seção 18.5
 * (`npm run ingestao -- itbi 2025`), mapeados para as rotinas da seção 4.4.
 */
const ALIASES: Readonly<Record<string, Rotina>> = {
  itbi: "ingestao-itbi",
  iptu: "ingestao-iptu",
  anuncios: "coleta-anuncios",
  leiloes: "coleta-leiloes",
};

/**
 * Interpreta os argumentos da linha de comando.
 * Recebe: os argumentos depois do nome do script (ex.: ["itbi", "2025"] ou
 * ["ingestao-itbi", "2025"]).
 * Devolve: a rotina validada (nome da seção 4.4) e os argumentos restantes;
 * lança erro com a lista de rotinas válidas se o nome não existir.
 */
export function parseArgs(argv: readonly string[]): { rotina: Rotina; args: string[] } {
  const [nome, ...args] = argv;
  const rotina = nome ? (ALIASES[nome] ?? nome) : undefined;
  if (!rotina || !(ROTINAS as readonly string[]).includes(rotina)) {
    throw new Error(`Rotina inválida: "${nome ?? ""}". Use uma de: ${ROTINAS.join(", ")}.`);
  }
  return { rotina: rotina as Rotina, args };
}

/**
 * Lê "--opcao valor" dos argumentos restantes.
 * Recebe: argumentos e o nome da opção (sem "--"). Devolve: o valor ou undefined.
 */
export function option(args: readonly string[], nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * Caminho informado pelo usuário, relativo à pasta onde ele rodou o comando
 * (npm muda o cwd para o workspace; INIT_CWD guarda a pasta original).
 */
function userPath(p: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

/**
 * Executa a rotina pedida.
 * Recebe: argumentos da linha de comando. Devolve: código de saída do processo
 * (0 sucesso, 1 erro — o GitHub Actions avisa por e-mail quando é ≠ 0; observabilidade O1).
 */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { rotina, args } = parseArgs(argv);
    switch (rotina) {
      case "ingestao-iptu": {
        // Uso: iptu <ano> [--arquivo IPTU_<ano>.zip]; sem arquivo, usa IPTU_ARQUIVO_URL ou o Storage.
        const ano = Number(args[0]);
        if (!Number.isInteger(ano) || ano < 2000) throw new Error("Informe o ano do IPTU: npm run ingestao -- iptu 2026 [--arquivo IPTU_2026.zip]");
        const arquivo = option(args, "arquivo");
        const { runIptu } = await import("./iptu/rotina.js");
        await runIptu(createServiceClient(), {
          ano,
          arquivo: arquivo ? userPath(arquivo) : undefined,
          url: process.env.IPTU_ARQUIVO_URL || undefined,
        });
        return 0;
      }
      case "ingestao-itbi": {
        // Uso: itbi [ano] [--arquivo planilha.xlsx]; sem arquivo, baixa da página ITBI_PAGINA_URL.
        const ano = args[0] && !args[0].startsWith("--") ? Number(args[0]) : undefined;
        if (ano !== undefined && !Number.isInteger(ano)) throw new Error("Ano inválido: npm run ingestao -- itbi [2025] [--arquivo planilha.xlsx]");
        const arquivo = option(args, "arquivo");
        const { runItbi } = await import("./itbi/rotina.js");
        await runItbi(createServiceClient(), {
          ano,
          arquivo: arquivo ? userPath(arquivo) : undefined,
          paginaUrl: process.env.ITBI_PAGINA_URL || undefined,
        });
        return 0;
      }
      case "coleta-anuncios": {
        // Uso: anuncios [--predio <chave_predio>]; teto em FIRECRAWL_MAX_CREDITOS_EXECUCAO (seção 17).
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (!apiKey) throw new Error("FIRECRAWL_API_KEY não definida (seção 18.4).");
        const teto = process.env.FIRECRAWL_MAX_CREDITOS_EXECUCAO ? Number(process.env.FIRECRAWL_MAX_CREDITOS_EXECUCAO) : undefined;
        const { runAdsCollection } = await import("./anuncios/rotina.js");
        await runAdsCollection(createServiceClient(), { apiKey, maxCreditos: teto, predio: option(args, "predio") });
        return 0;
      }
      case "coleta-leiloes": {
        // Uso: leiloes [--predio <chave_predio>]; tetos em FIRECRAWL_MAX_CREDITOS_EXECUCAO,
        // LEILAO_MAX_ALVOS_EXECUCAO e CLAUDE_MAX_DOCUMENTOS_EXECUCAO; allowlist em LEILAO_DOMINIOS (18.4).
        const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
        if (!firecrawlApiKey) throw new Error("FIRECRAWL_API_KEY não definida (seção 18.4).");
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não definida (seção 18.4).");
        const numero = (v: string | undefined) => (v ? Number(v) : undefined);
        const dominios = process.env.LEILAO_DOMINIOS?.split(",").map((d) => d.trim()).filter(Boolean);
        const { runAuctionCollection } = await import("./leiloes/rotina.js");
        await runAuctionCollection(createServiceClient(), {
          firecrawlApiKey,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          maxCreditos: numero(process.env.FIRECRAWL_MAX_CREDITOS_EXECUCAO),
          maxAlvos: numero(process.env.LEILAO_MAX_ALVOS_EXECUCAO),
          maxDocumentos: numero(process.env.CLAUDE_MAX_DOCUMENTOS_EXECUCAO),
          dominios: dominios?.length ? dominios : undefined,
          predio: option(args, "predio"),
        });
        return 0;
      }
      case "calibracao": {
        // Uso: calibracao. Por ora: ligação tardia (9.2) e vendas consolidadas (8.4); o resto entra no 8.6.
        const { runCalibration } = await import("./calibracao/rotina.js");
        await runCalibration(createServiceClient());
        return 0;
      }
      default:
        console.error(`Rotina "${rotina}" ainda não implementada.`);
        return 1;
    }
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}

// Executa só quando chamado direto pela linha de comando (não nos testes).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((codigo) => process.exit(codigo));
}
