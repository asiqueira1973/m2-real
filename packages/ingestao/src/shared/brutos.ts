/**
 * Arquivos brutos no Storage (seção 4.1 "Storage: arquivos brutos"; seção 17: retenção de
 * 2 versões por fonte/ano). Usado pelo IPTU (8.2) e pelo ITBI (8.3).
 * Nunca recebe PDF de leilão (seção 20).
 */
import { createHash } from "node:crypto";
import type { M2Client } from "@m2-real/db/server";

export const BUCKET_BRUTOS = "m2_brutos";

/** SHA-256 hexadecimal de um conteúdo (arquivo_hash da execução, regra 11.1 / épico 8.3). */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Guarda o bruto em m2_brutos/<pasta>/<nome>.<ext>, movendo a versão anterior para
 * <nome>.anterior.<ext> (2 versões, seção 17). Se o arquivo guardado tem o mesmo hash, não regrava.
 * Recebe: cliente service role, pasta ("iptu", "itbi"), nome ("2026"), extensão, conteúdo e tipo MIME.
 * Devolve: o caminho no bucket. Lança erro se o Storage recusar.
 */
export async function storeRaw(
  db: M2Client,
  pasta: string,
  nome: string,
  ext: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const caminho = `${pasta}/${nome}.${ext}`;
  const anterior = `${pasta}/${nome}.anterior.${ext}`;
  const bucket = db.storage.from(BUCKET_BRUTOS);
  const { data: atual } = await bucket.download(caminho);
  if (atual) {
    if (sha256(Buffer.from(await atual.arrayBuffer())) === sha256(buffer)) return caminho;
    await bucket.remove([anterior]);
    const { error } = await bucket.move(caminho, anterior);
    if (error) throw new Error(`Falha ao preservar a versão anterior do bruto ${caminho}: ${error.message}`);
  }
  const { error } = await bucket.upload(caminho, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Falha ao guardar o bruto em ${BUCKET_BRUTOS}/${caminho}: ${error.message}`);
  return caminho;
}
