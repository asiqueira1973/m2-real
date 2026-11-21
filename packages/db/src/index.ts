/**
 * Pacote compartilhado do banco (seção 18.3): só tipos, seguro para qualquer código.
 * O cliente com service role fica em "@m2-real/db/server" (só servidor, seção 20).
 */
export type { Database } from "./types.js";
export type { M2Client } from "./server.js";
