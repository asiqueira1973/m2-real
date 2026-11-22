/** UUID canônico (8-4-4-4-12 hex). Recebe: texto. Devolve: se é um UUID; ids malformados viram 404, não erro de banco. */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
