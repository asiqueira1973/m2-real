/**
 * Disparo de workflows do GitHub Actions (seção 13.1: /api/execucoes/disparar; 4.4). SÓ SERVIDOR:
 * usa GITHUB_TOKEN_DISPATCH (secreto, 18.4), que nunca vai para o navegador.
 */
import { ROTINAS, type Rotina } from "@m2-real/ingestao/regras";

/** Arquivo do workflow de cada rotina da 4.4 (.github/workflows/). */
export const WORKFLOW_DA_ROTINA: Readonly<Record<Rotina, string>> = {
  "ingestao-itbi": "ingestao-itbi.yml",
  "ingestao-iptu": "ingestao-iptu.yml",
  "coleta-anuncios": "coleta-anuncios.yml",
  "coleta-leiloes": "coleta-leiloes.yml",
  calibracao: "calibracao.yml",
};

/** Recebe: texto. Devolve: a rotina, se for uma das da 4.4; senão nulo. */
export function parseRotina(v: unknown): Rotina | null {
  return typeof v === "string" && (ROTINAS as readonly string[]).includes(v) ? (v as Rotina) : null;
}

/**
 * Chama o workflow_dispatch da rotina no branch main.
 * Recebe: rotina, ambiente (GITHUB_TOKEN_DISPATCH e GITHUB_REPO) e, nos testes, um fetch falso.
 * Devolve: nada (204 do GitHub). Lança erro com mensagem clara se faltar configuração ou o
 * GitHub recusar.
 */
export async function dispatchWorkflow(
  rotina: Rotina,
  env: Record<string, string | undefined> = process.env,
  fazerFetch: typeof fetch = fetch,
): Promise<void> {
  const token = env.GITHUB_TOKEN_DISPATCH;
  const repo = env.GITHUB_REPO;
  if (!token || !repo) throw new Error("Faltam GITHUB_TOKEN_DISPATCH e/ou GITHUB_REPO no servidor (seção 18.4).");
  const resp = await fazerFetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_DA_ROTINA[rotina]}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (resp.status !== 204) throw new Error(`O GitHub recusou o disparo de ${rotina} (HTTP ${resp.status}).`);
}
