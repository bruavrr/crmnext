import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "NextGen CRM · NextDim",
  description: "Seu próximo grande negócio começa aqui.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
