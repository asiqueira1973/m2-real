/**
 * Imagem de compartilhamento do site (épico 8.11): tipografia sobre o off-white da DabLab, sem foto,
 * para ficar legível em miniatura. Devolve: PNG 1200×630.
 */
import { ImageResponse } from "next/og";
import { BAIRROS_COBERTOS } from "@m2-real/ingestao/bairros";
import { HERO } from "@/features/site/conteudo";

export const alt = "Fechou por Quanto: por quanto o apartamento foi vendido, de verdade";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#fdfcfc", color: "#0a0a0a", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
        <div style={{ fontSize: 30, fontWeight: 600 }}>Fechou por Quanto</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.04, letterSpacing: -2 }}>
          {HERO.titulo.map((l) => <span key={l}>{l}</span>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "rgba(10,10,10,0.6)", borderTop: "2px solid #0a0a0a", paddingTop: 20 }}>
          <span>Vendas reais do ITBI · {BAIRROS_COBERTOS.length} bairros de São Paulo</span>
          <span>Um produto DabLab</span>
        </div>
      </div>
    ),
    size,
  );
}
