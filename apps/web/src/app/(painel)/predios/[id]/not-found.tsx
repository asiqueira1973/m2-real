/** Prédio inexistente (id inválido ou removido): estado vazio com volta à lista. */
import Link from "next/link";
import { EstadoVazio } from "@/components/estado-vazio";

export default function PredioNaoEncontrado() {
  return (
    <div className="space-y-4">
      <EstadoVazio mensagem="Prédio não encontrado." />
      <Link href="/predios" className="text-sm text-primary hover:underline">← Voltar para Prédios</Link>
    </div>
  );
}
