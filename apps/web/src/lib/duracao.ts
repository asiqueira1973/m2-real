/**
 * Duração de uma execução (seção 10, Execuções). Função pura.
 * Recebe: início e fim ISO (fim nulo = em andamento). Devolve: "42 s", "3 min 05 s", "1 h 12 min" ou "—".
 */
export function duration(inicio: string, fim: string | null): string {
  if (!fim) return "—";
  const s = Math.max(0, Math.round((Date.parse(fim) - Date.parse(inicio)) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}
