/**
 * Layout raiz do app (painel + MCP). Recebe as páginas filhas e devolve o HTML base
 * em pt-BR (seção 17: idioma pt-BR). O menu lateral do painel entra no épico 8.7.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fechou por Quanto",
  description: "Base de preço real por prédio e planta",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
