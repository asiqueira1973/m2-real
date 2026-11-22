/**
 * Chaves de API do MCP (seções 6.3 e 13.1). Funções puras (só node:crypto).
 * A chave tem 32 bytes aleatórios em base64url; o banco guarda só o hash SHA-256 e o prefixo.
 */
import { createHash, randomBytes } from "node:crypto";

import { NOME_CHAVE_MAX, NOME_CHAVE_MIN } from "./chaves-regras";
/** 7.2: m2_chaves_api.prefixo é char(8), para reconhecer a chave na lista. */
export const PREFIXO_CHAVE_TAMANHO = 8;
/** 13.1: 32 bytes aleatórios. */
const BYTES_CHAVE = 32;

/** Recebe: nome digitado. Devolve: o nome limpo, ou nulo se não tiver de 3 a 60 caracteres. */
export function validKeyName(nome: unknown): string | null {
  const n = typeof nome === "string" ? nome.trim() : "";
  return n.length >= NOME_CHAVE_MIN && n.length <= NOME_CHAVE_MAX ? n : null;
}

/** Hash SHA-256 (hex) da chave: o que vai para m2_chaves_api.hash_chave (6.3). */
export function hashKey(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

/** Gera uma chave nova. Devolve: a chave (mostrada uma vez), o hash e o prefixo. */
export function generateKey(): { chave: string; hash: string; prefixo: string } {
  const chave = randomBytes(BYTES_CHAVE).toString("base64url");
  return { chave, hash: hashKey(chave), prefixo: chave.slice(0, PREFIXO_CHAVE_TAMANHO) };
}
