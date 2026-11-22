/**
 * Arquivos brutos (seção 4.1 "Storage: arquivos brutos"; seção 17: retenção de 2 versões por
 * fonte/ano). Usado pelo IPTU (8.2) e pelo ITBI (8.3). Nunca recebe PDF de leilão (seção 20).
 * Dois armazéns com a mesma interface (épico 8.8, decisão do usuário):
 *  - Storage do Supabase (bucket m2_brutos): padrão, usado no ambiente local;
 *  - Cloudflare R2 (bucket m2-brutos, mesma conta do Assina): com BRUTOS_ARMAZEM=r2, usado no
 *    GitHub Actions — o Storage do plano grátis do Supabase recusa arquivos acima de 50 MB, e o
 *    IPTU anual é bem maior.
 */
import { createHash } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { M2Client } from "@m2-real/db/server";
import { ESPERAS_PADRAO_MS, isTransient, type RetryOptions } from "./retry.js";

export const BUCKET_BRUTOS = "m2_brutos";

/** SHA-256 hexadecimal de um conteúdo (arquivo_hash da execução, regra 11.1 / épico 8.3). */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** O que downloadIfExists precisa de um bucket do Storage (supabase-js ou fake nos testes). */
export interface BucketLike {
  download(caminho: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
}

/**
 * Baixa um arquivo do Storage, distinguindo ausência de erro (bug da 2ª carga do IPTU: erro
 * passageiro era tratado como "não encontrado").
 * Recebe: bucket, caminho e opções de repetição. Devolve: o conteúdo, ou nulo SÓ se o Storage
 * disser que o objeto não existe. Erro passageiro é repetido (shared/retry.ts); outro erro lança
 * com a mensagem real.
 */
export async function downloadIfExists(bucket: BucketLike, caminho: string, retry: RetryOptions = {}): Promise<Buffer | null> {
  const esperas = retry.esperasMs ?? ESPERAS_PADRAO_MS;
  for (let tentativa = 0; ; tentativa++) {
    const { data, error } = await bucket.download(caminho);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
    const e = error ?? { message: "resposta vazia do Storage" };
    const status = (e as { statusCode?: string | number; status?: number }).statusCode ?? (e as { status?: number }).status;
    if (/not.?found/i.test(e.message) || String(status) === "404") return null;
    if (!isTransient(e) || tentativa >= esperas.length) throw new Error(`Falha ao baixar ${BUCKET_BRUTOS}/${caminho}: ${e.message}`);
    console.warn(`Storage: erro passageiro ao baixar ${caminho} (${e.message}); tentativa ${tentativa + 2}.`);
    await new Promise((r) => setTimeout(r, esperas[tentativa]));
  }
}

/** Armazém de brutos: o que storeRaw e as rotinas precisam (Storage do Supabase ou R2). */
export interface ArmazemBrutos {
  /** Nome para logs e mensagens ("supabase:m2_brutos", "r2:m2-brutos"). */
  nome: string;
  /** Conteúdo do arquivo, ou nulo se ele não existe (erro passageiro é repetido; outro erro lança). */
  ler(caminho: string): Promise<Buffer | null>;
  /** Grava (substitui) o arquivo. */
  gravar(caminho: string, conteudo: Buffer, contentType: string): Promise<void>;
  /** Move o arquivo de um caminho para outro (substitui o destino). */
  mover(de: string, para: string): Promise<void>;
}

/**
 * Armazém no Storage do Supabase (bucket m2_brutos). Recebe: cliente service role.
 * Devolve: o armazém. Lança erro com a mensagem real se o Storage recusar.
 */
export function supabaseRawStore(db: M2Client): ArmazemBrutos {
  const bucket = db.storage.from(BUCKET_BRUTOS);
  return {
    nome: `supabase:${BUCKET_BRUTOS}`,
    ler: (caminho) => downloadIfExists(bucket, caminho),
    async gravar(caminho, conteudo, contentType) {
      const { error } = await bucket.upload(caminho, conteudo, { contentType, upsert: true });
      if (error) throw new Error(`Falha ao guardar o bruto em ${BUCKET_BRUTOS}/${caminho}: ${error.message}`);
    },
    async mover(de, para) {
      await bucket.remove([para]);
      const { error } = await bucket.move(de, para);
      if (error) throw new Error(`Falha ao mover ${de} para ${para}: ${error.message}`);
    },
  };
}

/** O que o armazém R2 usa do cliente S3 (o teste injeta um falso). */
export type EnviaS3 = Pick<S3Client, "send">;

/**
 * Armazém no Cloudflare R2 (API compatível com S3). Recebe: o ambiente (R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET; seção 18.4 + épico 8.8) e, nos testes, um
 * cliente falso. Devolve: o armazém. O SDK já repete erros passageiros (3 tentativas).
 */
export function r2RawStore(env: Record<string, string | undefined> = process.env, cliente?: EnviaS3): ArmazemBrutos {
  const conta = env.R2_ACCOUNT_ID?.trim();
  const chave = env.R2_ACCESS_KEY_ID?.trim();
  const segredo = env.R2_SECRET_ACCESS_KEY?.trim();
  const Bucket = env.R2_BUCKET?.trim();
  if (!Bucket || (!cliente && (!conta || !chave || !segredo))) {
    throw new Error("BRUTOS_ARMAZEM=r2 exige R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.");
  }
  const s3 = cliente ?? new S3Client({
    region: "auto",
    endpoint: `https://${conta}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: chave!, secretAccessKey: segredo! },
  });
  const ausente = (e: unknown) => {
    const x = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    return x.name === "NoSuchKey" || x.name === "NotFound" || x.$metadata?.httpStatusCode === 404;
  };
  return {
    nome: `r2:${Bucket}`,
    async ler(caminho) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket, Key: caminho }));
        return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
      } catch (e) {
        if (ausente(e)) return null;
        throw new Error(`Falha ao baixar ${Bucket}/${caminho} do R2: ${(e as Error).message}`);
      }
    },
    async gravar(caminho, conteudo, contentType) {
      await s3.send(new PutObjectCommand({ Bucket, Key: caminho, Body: conteudo, ContentType: contentType }));
    },
    async mover(de, para) {
      await s3.send(new CopyObjectCommand({ Bucket, Key: para, CopySource: `${Bucket}/${encodeURIComponent(de).replace(/%2F/g, "/")}` }));
      await s3.send(new DeleteObjectCommand({ Bucket, Key: de }));
    },
  };
}

/**
 * Escolhe o armazém: R2 com BRUTOS_ARMAZEM=r2 (GitHub Actions), senão o Storage do Supabase.
 * Recebe: cliente service role e o ambiente. Devolve: o armazém.
 */
export function rawStoreFromEnv(db: M2Client, env: Record<string, string | undefined> = process.env): ArmazemBrutos {
  return env.BRUTOS_ARMAZEM?.trim() === "r2" ? r2RawStore(env) : supabaseRawStore(db);
}

/**
 * Guarda o bruto em <pasta>/<nome>.<ext>, movendo a versão anterior para <nome>.anterior.<ext>
 * (2 versões, seção 17). Se o arquivo guardado tem o mesmo hash, não regrava.
 * Recebe: o armazém, pasta ("iptu", "itbi"), nome ("2026"), extensão, conteúdo e tipo MIME.
 * Devolve: o caminho no armazém. Lança erro se o armazém recusar.
 */
export async function storeRaw(
  armazem: ArmazemBrutos,
  pasta: string,
  nome: string,
  ext: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const caminho = `${pasta}/${nome}.${ext}`;
  const anterior = `${pasta}/${nome}.anterior.${ext}`;
  const atual = await armazem.ler(caminho);
  if (atual) {
    if (sha256(atual) === sha256(buffer)) return caminho;
    await armazem.mover(caminho, anterior);
  }
  await armazem.gravar(caminho, buffer, contentType);
  return caminho;
}
