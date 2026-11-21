/**
 * Pacote compartilhado de acesso ao banco (seção 18.3: tipos gerados e cliente).
 * No 8.0 só reexporta os tipos; o cliente com service role entra no 8.1 e é
 * usado apenas no servidor (ingestão e rotas do Next), nunca no navegador (seção 20).
 */
export type { Database } from "./types.js";
