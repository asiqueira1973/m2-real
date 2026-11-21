/**
 * Ponto de entrada da ingestão: `tsx src/cli.ts <rotina> [argumentos]` (seção 18.3).
 *
 * No épico 8.0, só valida o nome da rotina contra a seção 4.4. As rotinas são
 * ligadas aqui nos épicos 8.2 (iptu), 8.3 (itbi), 8.5 (anúncios), 8.5.1 (leilões)
 * e 8.6 (calibração).
 */
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
 * Executa a rotina pedida.
 * Recebe: argumentos da linha de comando. Devolve: código de saída do processo
 * (0 sucesso, 1 erro). Por ora, toda rotina válida responde "ainda não implementada".
 */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { rotina } = parseArgs(argv);
    console.error(`Rotina "${rotina}" ainda não implementada.`);
    return 1;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}

// Executa só quando chamado direto pela linha de comando (não nos testes).
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((codigo) => process.exit(codigo));
}
