/**
 * Layout raiz do app (painel + MCP). Recebe as páginas filhas e devolve o HTML base em pt-BR
 * (seção 17), com a fonte Inter (seção 16). O menu lateral fica no layout do grupo (painel).
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Fechou por Quanto",
  description: "Base de preço real por prédio e planta",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
